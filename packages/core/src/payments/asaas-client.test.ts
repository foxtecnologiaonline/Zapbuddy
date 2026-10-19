import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAsaasCustomer, createAsaasSubscription } from './asaas-client.js';

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.ASAAS_API_KEY = 'test-key';
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('createAsaasCustomer', () => {
  it('usa o endpoint sandbox por padrão (sem ASAAS_ENV) e limpa máscara do CPF/CNPJ', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'cus_123' }) });
    global.fetch = fetchMock as never;

    const result = await createAsaasCustomer({ name: 'Marina', cpfCnpj: '123.456.789-00', externalReference: 'user-1' });

    expect(result).toEqual({ id: 'cus_123' });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sandbox.asaas.com/api/v3/customers');
    expect((options.headers as Record<string, string>).access_token).toBe('test-key');
    expect(JSON.parse(options.body as string)).toEqual({ name: 'Marina', cpfCnpj: '12345678900', externalReference: 'user-1' });
  });

  it('usa o endpoint de produção quando ASAAS_ENV=production', async () => {
    process.env.ASAAS_ENV = 'production';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'cus_1' }) });
    global.fetch = fetchMock as never;

    await createAsaasCustomer({ name: 'Marina', cpfCnpj: '12345678900', externalReference: 'user-1' });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://api.asaas.com/v3/customers');
  });

  it('propaga o erro com o corpo da resposta quando a Asaas rejeita a requisição', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => '{"errors":[{"description":"CPF inválido"}]}' }) as never;

    await expect(createAsaasCustomer({ name: 'Marina', cpfCnpj: '000', externalReference: 'user-1' })).rejects.toThrow('CPF inválido');
  });
});

describe('createAsaasSubscription', () => {
  it('cria a assinatura mensal com o preço decidido e devolve o paymentLink', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'sub_456', status: 'ACTIVE', paymentLink: 'https://asaas.com/pay/abc' }),
    });
    global.fetch = fetchMock as never;

    const result = await createAsaasSubscription({ customerId: 'cus_123', externalReference: 'user-1' });

    expect(result).toEqual({ id: 'sub_456', status: 'ACTIVE', paymentLink: 'https://asaas.com/pay/abc' });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.customer).toBe('cus_123');
    expect(body.value).toBe(27.9);
    expect(body.cycle).toBe('MONTHLY');
    expect(body.billingType).toBe('UNDEFINED');
  });
});
