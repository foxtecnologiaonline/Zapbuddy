/**
 * Preço decidido pelo dono do produto (2026-10, reversão explícita do ADR
 * 0004 — "sem preço fechado nesta rodada") — fonte única pro que a Asaas
 * cobra (asaas-client.ts) e pro que o Tom cita na conversa (system-prompt.ts).
 */
export const MONTHLY_PRICE_CENTS = 2790;

export function formatMonthlyPriceBRL(): string {
  return (MONTHLY_PRICE_CENTS / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
