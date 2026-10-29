import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const db = vi.hoisted(() => ({ registerPlanIntent: vi.fn().mockResolvedValue(undefined) }));
const upgradeFlow = vi.hoisted(() => ({ generateUpgradeCheckout: vi.fn() }));

vi.mock('@zapbuddy/db', () => db);
vi.mock('./upgrade-flow.js', async () => {
  const actual = await vi.importActual<typeof import('./upgrade-flow.js')>('./upgrade-flow.js');
  return { ...actual, generateUpgradeCheckout: upgradeFlow.generateUpgradeCheckout };
});

import { isAccessBlocked, handleBlockedMessage } from './trial-gate.js';

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Marina',
    preferred_name: null,
    cpf_cnpj: null,
    asaas_customer_id: null,
    asaas_subscription_id: null,
    asaas_payment_link: null,
    plan_status: 'trial',
    trial_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  } as never;
}

describe('isAccessBlocked — cobrança ligada', () => {
  beforeEach(() => vi.stubEnv('BILLING_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('nunca bloqueia assinante ativo, mesmo com trial_ends_at no passado', () => {
    expect(isAccessBlocked(baseUser({ plan_status: 'active', trial_ends_at: new Date(Date.now() - 1000).toISOString() }))).toBe(false);
  });

  it('sempre bloqueia quem já cancelou', () => {
    expect(isAccessBlocked(baseUser({ plan_status: 'canceled' }))).toBe(true);
  });

  it('não bloqueia trial ainda dentro da janela', () => {
    expect(isAccessBlocked(baseUser({ trial_ends_at: new Date(Date.now() + 1000).toISOString() }))).toBe(false);
  });

  it('bloqueia trial com trial_ends_at no passado', () => {
    expect(isAccessBlocked(baseUser({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }))).toBe(true);
  });
});

describe('isAccessBlocked — cobrança inibida (padrão, até próxima ordem)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('ninguém é bloqueado: nem trial vencido, nem quem cancelou', () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    expect(isAccessBlocked(baseUser({ trial_ends_at: expired }))).toBe(false);
    expect(isAccessBlocked(baseUser({ plan_status: 'canceled' }))).toBe(false);
  });

  it('só a variável exatamente "true" liga a cobrança (qualquer outra coisa segue desligada)', () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    vi.stubEnv('BILLING_ENABLED', '1');
    expect(isAccessBlocked(baseUser({ trial_ends_at: expired }))).toBe(false);
    vi.stubEnv('BILLING_ENABLED', 'true');
    expect(isAccessBlocked(baseUser({ trial_ends_at: expired }))).toBe(true);
  });
});

describe('handleBlockedMessage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mensagem comum (não é CPF/CNPJ) devolve o aviso fixo, sem registrar intenção nem chamar checkout', async () => {
    const result = await handleBlockedMessage(baseUser(), 'oi, quero registrar um gasto de 50 reais');

    expect(result.replyText).toMatch(/3 dias de teste chegaram ao fim/i);
    expect(db.registerPlanIntent).not.toHaveBeenCalled();
    expect(upgradeFlow.generateUpgradeCheckout).not.toHaveBeenCalled();
  });

  it('mensagem com texto misturado a dígitos (ex.: telefone) não é tratada como CPF', async () => {
    const result = await handleBlockedMessage(baseUser(), 'meu telefone é 11999998888');

    expect(result.replyText).toMatch(/3 dias de teste chegaram ao fim/i);
    expect(upgradeFlow.generateUpgradeCheckout).not.toHaveBeenCalled();
  });

  it('mensagem só com CPF (com ou sem pontuação) registra intenção e gera checkout', async () => {
    upgradeFlow.generateUpgradeCheckout.mockResolvedValueOnce({ checkoutUrl: 'https://asaas.com/pay/abc' });

    const result = await handleBlockedMessage(baseUser(), '123.456.789-00');

    expect(db.registerPlanIntent).toHaveBeenCalledWith('user-1', 'upgrade');
    expect(upgradeFlow.generateUpgradeCheckout).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), '12345678900');
    expect(result.replyText).toContain('https://asaas.com/pay/abc');
  });

  it('quem já tem link de pagamento gerado recebe o link de novo, em vez de ser pedido o CPF outra vez', async () => {
    const result = await handleBlockedMessage(baseUser({ asaas_payment_link: 'https://asaas.com/pay/abc' }), 'oi');

    expect(result.replyText).toContain('https://asaas.com/pay/abc');
    expect(upgradeFlow.generateUpgradeCheckout).not.toHaveBeenCalled();
  });

  it('mensagem curta demais pra ser CPF/CNPJ (ex.: "123") nem chega a chamar o checkout — cai no aviso padrão', async () => {
    const result = await handleBlockedMessage(baseUser(), '123');

    expect(upgradeFlow.generateUpgradeCheckout).not.toHaveBeenCalled();
    expect(result.replyText).toMatch(/3 dias de teste chegaram ao fim/i);
  });

  it('se o checkout mesmo assim devolver invalidCpf, repassa o aviso específico', async () => {
    upgradeFlow.generateUpgradeCheckout.mockResolvedValueOnce({ invalidCpf: true });

    const result = await handleBlockedMessage(baseUser(), '12345678900');

    expect(result.replyText).toMatch(/quantidade certa de dígitos/i);
  });
});
