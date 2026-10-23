import { describe, expect, it, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  saveUserCpfCnpj: vi.fn().mockResolvedValue(undefined),
  saveAsaasSubscription: vi.fn().mockResolvedValue(undefined),
}));

const asaas = vi.hoisted(() => ({
  createAsaasCustomer: vi.fn(),
  createAsaasSubscription: vi.fn(),
}));

vi.mock('@zapbuddy/db', () => db);
vi.mock('./asaas-client.js', () => asaas);

import { generateUpgradeCheckout, normalizeCpfCnpj, isPlausibleCpfCnpj } from './upgrade-flow.js';

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Marina',
    preferred_name: null,
    cpf_cnpj: null,
    asaas_customer_id: null,
    asaas_subscription_id: null,
    asaas_payment_link: null,
    ...overrides,
  } as never;
}

describe('normalizeCpfCnpj / isPlausibleCpfCnpj', () => {
  it('normaliza removendo pontuação e espaço', () => {
    expect(normalizeCpfCnpj('123.456.789-00')).toBe('12345678900');
  });

  it('aceita 11 (CPF) ou 14 (CNPJ) dígitos, rejeita qualquer outro tamanho', () => {
    expect(isPlausibleCpfCnpj('12345678900')).toBe(true);
    expect(isPlausibleCpfCnpj('12345678000199')).toBe(true);
    expect(isPlausibleCpfCnpj('123')).toBe(false);
  });
});

describe('generateUpgradeCheckout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sem CPF salvo e sem input, pede o CPF antes de criar qualquer coisa', async () => {
    const result = await generateUpgradeCheckout(baseUser());

    expect(result).toEqual({ needsCpf: true });
    expect(asaas.createAsaasCustomer).not.toHaveBeenCalled();
  });

  it('CPF com quantidade errada de dígitos devolve invalidCpf, sem chamar a Asaas', async () => {
    const result = await generateUpgradeCheckout(baseUser(), '123');

    expect(result).toEqual({ invalidCpf: true });
    expect(asaas.createAsaasCustomer).not.toHaveBeenCalled();
  });

  it('com cpf_cnpj novo, normaliza, salva, cria cliente+assinatura e devolve checkoutUrl', async () => {
    asaas.createAsaasCustomer.mockResolvedValueOnce({ id: 'cus_123' });
    asaas.createAsaasSubscription.mockResolvedValueOnce({ id: 'sub_456', status: 'ACTIVE', paymentLink: 'https://asaas.com/pay/abc' });

    const result = await generateUpgradeCheckout(baseUser(), '123.456.789-00');

    expect(db.saveUserCpfCnpj).toHaveBeenCalledWith('user-1', '12345678900');
    expect(asaas.createAsaasCustomer).toHaveBeenCalledWith({ name: 'Marina', cpfCnpj: '12345678900', externalReference: 'user-1' });
    expect(result).toEqual({ checkoutUrl: 'https://asaas.com/pay/abc' });
  });

  it('reusa assinatura já existente, sem chamar a Asaas de novo', async () => {
    const result = await generateUpgradeCheckout(
      baseUser({ asaas_subscription_id: 'sub_456', asaas_payment_link: 'https://asaas.com/pay/abc' }),
    );

    expect(result).toEqual({ checkoutUrl: 'https://asaas.com/pay/abc' });
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
  });
});
