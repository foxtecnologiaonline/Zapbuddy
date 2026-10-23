import type { User } from '@zapbuddy/db';
import { saveUserCpfCnpj, saveAsaasSubscription } from '@zapbuddy/db';
import { createAsaasCustomer, createAsaasSubscription } from './asaas-client.js';

/** Só dígitos — normaliza antes de salvar/comparar/mandar pra Asaas, pra nunca gravar duas grafias (com/sem pontuação) do mesmo CPF/CNPJ como "diferentes". */
export function normalizeCpfCnpj(value: string): string {
  return value.replace(/\D/g, '');
}

/** CPF = 11 dígitos, CNPJ = 14 — checagem de tamanho só, sem validar dígito verificador (a Asaas já faz essa validação de verdade do lado dela). */
export function isPlausibleCpfCnpj(digitsOnly: string): boolean {
  return digitsOnly.length === 11 || digitsOnly.length === 14;
}

export type UpgradeCheckoutResult = { needsCpf: true } | { invalidCpf: true } | { checkoutUrl: string };

/**
 * Gera (ou reaproveita) o checkout real da Asaas pra quem topou assinar.
 * Extraído de account.ts (tool `register_plan_intent`) pra ser reaproveitado
 * também pelo bloqueio de trial encerrado (trial-gate.ts) — mesma regra de
 * negócio ("nunca inventa checkout, sempre persiste antes de confirmar"),
 * dois pontos de entrada (conversa normal vs. mensagem bloqueada).
 */
export async function generateUpgradeCheckout(user: User, cpfCnpjInput?: string): Promise<UpgradeCheckoutResult> {
  if (user.asaas_subscription_id && user.asaas_payment_link) {
    return { checkoutUrl: user.asaas_payment_link };
  }

  const rawCpfCnpj = cpfCnpjInput ?? user.cpf_cnpj ?? undefined;
  if (!rawCpfCnpj) return { needsCpf: true };

  const cpfCnpj = normalizeCpfCnpj(rawCpfCnpj);
  if (!isPlausibleCpfCnpj(cpfCnpj)) return { invalidCpf: true };

  if (cpfCnpjInput && cpfCnpj !== user.cpf_cnpj) {
    await saveUserCpfCnpj(user.id, cpfCnpj);
  }

  const customer = user.asaas_customer_id
    ? { id: user.asaas_customer_id }
    : await createAsaasCustomer({
        name: user.preferred_name ?? user.name ?? 'Cliente ZapBuddy',
        cpfCnpj,
        externalReference: user.id,
      });

  const subscription = await createAsaasSubscription({ customerId: customer.id, externalReference: user.id });
  await saveAsaasSubscription(user.id, customer.id, subscription.id, subscription.paymentLink);

  return { checkoutUrl: subscription.paymentLink };
}
