import { describe, expect, it, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  createAccountInvite: vi.fn(),
  listAccountMembers: vi.fn(),
  getReferralStats: vi.fn(),
  registerPlanIntent: vi.fn().mockResolvedValue(undefined),
  findUserById: vi.fn(),
  saveUserCpfCnpj: vi.fn().mockResolvedValue(undefined),
  saveAsaasSubscription: vi.fn().mockResolvedValue(undefined),
}));

const asaas = vi.hoisted(() => ({
  createAsaasCustomer: vi.fn(),
  createAsaasSubscription: vi.fn(),
}));

vi.mock('@zapbuddy/db', () => db);
vi.mock('../../payments/asaas-client.js', () => asaas);

import { registerPlanIntentTool } from './account.js';

const ctx = { userId: 'user-1', accountId: 'account-1' } as never;

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
  };
}

describe('register_plan_intent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancel só registra a intenção — nunca chama a Asaas', async () => {
    const result = await registerPlanIntentTool.execute({ intent: 'cancel' }, ctx);

    expect(db.registerPlanIntent).toHaveBeenCalledWith('user-1', 'cancel');
    expect(result).toEqual({ registered: true });
    expect(asaas.createAsaasCustomer).not.toHaveBeenCalled();
  });

  it('upgrade sem CPF salvo e sem cpf_cnpj no parâmetro pede o CPF antes de criar qualquer coisa', async () => {
    db.findUserById.mockResolvedValueOnce(baseUser());

    const result = await registerPlanIntentTool.execute({ intent: 'upgrade' }, ctx);

    expect(result).toEqual({ registered: true, needs_cpf: true });
    expect(asaas.createAsaasCustomer).not.toHaveBeenCalled();
  });

  it('upgrade com cpf_cnpj novo normaliza (só dígitos), salva, cria cliente+assinatura na Asaas e devolve o checkout_url', async () => {
    db.findUserById.mockResolvedValueOnce(baseUser());
    asaas.createAsaasCustomer.mockResolvedValueOnce({ id: 'cus_123' });
    asaas.createAsaasSubscription.mockResolvedValueOnce({ id: 'sub_456', status: 'ACTIVE', paymentLink: 'https://asaas.com/pay/abc' });

    const result = await registerPlanIntentTool.execute({ intent: 'upgrade', cpf_cnpj: '123.456.789-00' }, ctx);

    expect(db.saveUserCpfCnpj).toHaveBeenCalledWith('user-1', '12345678900');
    expect(asaas.createAsaasCustomer).toHaveBeenCalledWith({ name: 'Marina', cpfCnpj: '12345678900', externalReference: 'user-1' });
    expect(db.saveAsaasSubscription).toHaveBeenCalledWith('user-1', 'cus_123', 'sub_456', 'https://asaas.com/pay/abc');
    expect(result).toEqual({ registered: true, checkout_url: 'https://asaas.com/pay/abc' });
  });

  it('upgrade com CPF/CNPJ sem a quantidade certa de dígitos devolve invalid_cpf, sem chamar a Asaas', async () => {
    db.findUserById.mockResolvedValueOnce(baseUser());

    const result = await registerPlanIntentTool.execute({ intent: 'upgrade', cpf_cnpj: '123' }, ctx);

    expect(result).toEqual({ registered: true, invalid_cpf: true });
    expect(db.saveUserCpfCnpj).not.toHaveBeenCalled();
    expect(asaas.createAsaasCustomer).not.toHaveBeenCalled();
  });

  it('upgrade reusa a assinatura já existente, sem chamar a Asaas de novo', async () => {
    db.findUserById.mockResolvedValueOnce(
      baseUser({ asaas_subscription_id: 'sub_456', asaas_payment_link: 'https://asaas.com/pay/abc' }),
    );

    const result = await registerPlanIntentTool.execute({ intent: 'upgrade' }, ctx);

    expect(result).toEqual({ registered: true, checkout_url: 'https://asaas.com/pay/abc' });
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
  });

  it('upgrade com CPF já salvo (sem mandar de novo) não chama saveUserCpfCnpj, mas segue o checkout', async () => {
    db.findUserById.mockResolvedValueOnce(baseUser({ cpf_cnpj: '12345678900', asaas_customer_id: 'cus_123' }));
    asaas.createAsaasSubscription.mockResolvedValueOnce({ id: 'sub_789', status: 'ACTIVE', paymentLink: 'https://asaas.com/pay/xyz' });

    const result = await registerPlanIntentTool.execute({ intent: 'upgrade' }, ctx);

    expect(db.saveUserCpfCnpj).not.toHaveBeenCalled();
    expect(asaas.createAsaasCustomer).not.toHaveBeenCalled();
    expect(asaas.createAsaasSubscription).toHaveBeenCalledWith({ customerId: 'cus_123', externalReference: 'user-1' });
    expect(result).toEqual({ registered: true, checkout_url: 'https://asaas.com/pay/xyz' });
  });
});
