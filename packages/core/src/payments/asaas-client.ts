import { MONTHLY_PRICE_CENTS } from './plan.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

/**
 * Sandbox por padrão de propósito (freio de segurança) — só cobra de
 * verdade quando ASAAS_ENV=production for setado explicitamente, depois
 * das credenciais reais estarem configuradas e testadas (ver .env.example).
 */
function getBaseUrl(): string {
  const env = process.env.ASAAS_ENV ?? 'sandbox';
  return env === 'production' ? 'https://api.asaas.com/v3' : 'https://sandbox.asaas.com/api/v3';
}

async function asaasPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Header exato documentado pela Asaas pra autenticação da API (não é Bearer/Authorization).
      access_token: requireEnv('ASAAS_API_KEY'),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Asaas ${path} falhou (${response.status}): ${errorBody}`);
  }
  return (await response.json()) as T;
}

export interface AsaasCustomer {
  id: string;
}

/**
 * `name`+`cpfCnpj` são os únicos campos exigidos pela Asaas pra criar um
 * cliente — o resto (email, telefone) não é coletado hoje, não é bloqueante
 * pro checkout funcionar.
 */
export async function createAsaasCustomer(params: { name: string; cpfCnpj: string; externalReference: string }): Promise<AsaasCustomer> {
  return asaasPost<AsaasCustomer>('/customers', {
    name: params.name,
    cpfCnpj: params.cpfCnpj.replace(/\D/g, ''),
    externalReference: params.externalReference,
  });
}

export interface AsaasSubscription {
  id: string;
  status: string;
  /** Link de checkout hospedado pela Asaas — a pessoa escolhe PIX/boleto/cartão lá, nunca entra no nosso código. */
  paymentLink: string;
}

/** `nextDueDate` = hoje — a 1ª cobrança sai assim que a pessoa fechar o checkout, sem carência artificial. */
export async function createAsaasSubscription(params: { customerId: string; externalReference: string }): Promise<AsaasSubscription> {
  const today = new Date().toISOString().slice(0, 10);
  return asaasPost<AsaasSubscription>('/subscriptions', {
    customer: params.customerId,
    billingType: 'UNDEFINED',
    value: MONTHLY_PRICE_CENTS / 100,
    nextDueDate: today,
    cycle: 'MONTHLY',
    description: 'ZapBuddy — assinatura mensal',
    externalReference: params.externalReference,
  });
}
