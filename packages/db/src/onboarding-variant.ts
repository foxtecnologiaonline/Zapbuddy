import type { OnboardingVariant } from './types.js';

/**
 * Split determinístico (não aleatório) por número de WhatsApp — a mesma
 * pessoa sempre cai na mesma variante mesmo se `createUser` fosse chamado
 * mais de uma vez (não deveria acontecer, mas não depende de sorte pra ser
 * estável), e dá pra reproduzir em teste sem mockar `Math.random`. Metade
 * pelo último dígito do número (par/ímpar) — distribuição aproximadamente
 * 50/50 sem precisar de nenhuma lib de hash.
 */
export function assignOnboardingVariant(whatsappNumber: string): OnboardingVariant {
  const lastDigit = Number(whatsappNumber[whatsappNumber.length - 1]);
  return lastDigit % 2 === 0 ? 'ask_name_first' : 'ask_action_first';
}
