import type { User } from '@zapbuddy/db';
import { registerPlanIntent } from '@zapbuddy/db';
import { generateUpgradeCheckout, normalizeCpfCnpj, isPlausibleCpfCnpj } from './upgrade-flow.js';
import { MESSAGES } from '../messages.js';
import { isBillingEnabled } from '../features.js';

/**
 * Teste grátis de 3 dias com bloqueio REAL de uso (2026-10, pedido explícito
 * do dono do produto — ver CLAUDE.md). Diferente do convite por conversa do
 * ADR 0004 (que nunca bloqueava — só pedia, no máximo uma vez por conversa,
 * e aceitava um "não"): aqui a mensagem nem chega a rodar o LLM depois do
 * fim do trial. `plan_status = 'canceled'` também bloqueia — não tem
 * sentido alguém que já cancelou continuar com acesso de graça.
 */
export function isAccessBlocked(user: User): boolean {
  // Cobrança inibida até próxima ordem (features.ts): ninguém é bloqueado, nem quem cancelou.
  if (!isBillingEnabled()) return false;
  if (user.plan_status === 'active') return false;
  if (user.plan_status === 'canceled') return true;
  return new Date(user.trial_ends_at).getTime() <= Date.now();
}

/**
 * Única "porta" que passa pelo bloqueio: a mensagem inteira (sem mais nada
 * em volta, só pontuação/espaço) precisa ser um CPF/CNPJ plausível — é como
 * a pessoa bloqueada consegue gerar o link de pagamento, já que a Asaas
 * exige o documento antes de criar o checkout (asaas-client.ts). Mensagem
 * com letras misturadas nunca passa (evita confundir um número de telefone
 * ou outro texto qualquer com tentativa de CPF).
 */
function extractCpfCnpjAttempt(messageText: string): string | undefined {
  const trimmed = messageText.trim();
  if (!/^[\d.\-/\s]+$/.test(trimmed)) return undefined;
  const digitsOnly = normalizeCpfCnpj(trimmed);
  return isPlausibleCpfCnpj(digitsOnly) ? digitsOnly : undefined;
}

/**
 * Roda no lugar do orquestrador normal pra quem está bloqueado — nunca
 * monta system prompt, nunca chama o LLM, nunca grava turno de conversa no
 * Redis (não é uma conversa de verdade, é uma mensagem de sistema repetida
 * até a pessoa assinar ou um admin mudar `plan_status` manualmente).
 */
export async function handleBlockedMessage(user: User, messageText: string): Promise<{ replyText: string }> {
  const cpfCnpjAttempt = extractCpfCnpjAttempt(messageText);
  if (!cpfCnpjAttempt) {
    // Já gerou o link antes (mandou CPF e não pagou): reenvia direto em vez de pedir CPF de novo.
    if (user.asaas_payment_link) {
      return { replyText: MESSAGES.trialBlockedCheckoutReady(user.asaas_payment_link) };
    }
    return { replyText: MESSAGES.trialBlocked };
  }

  await registerPlanIntent(user.id, 'upgrade');
  const result = await generateUpgradeCheckout(user, cpfCnpjAttempt);

  if ('checkoutUrl' in result) return { replyText: MESSAGES.trialBlockedCheckoutReady(result.checkoutUrl) };
  if ('invalidCpf' in result) return { replyText: MESSAGES.trialBlockedInvalidCpf };
  return { replyText: MESSAGES.trialBlocked };
}
