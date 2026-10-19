/**
 * Link `wa.me` pra abrir o WhatsApp do Tom direto com uma mensagem
 * pré-preenchida (2026-10, pedido do dono do produto) — distinto de
 * `WHATSAPP_PHONE_NUMBER_ID` (identificador opaco da Cloud API da Meta,
 * usado só nas chamadas da API): `wa.me` exige o número de telefone real
 * (MSISDN, com DDI+DDD) do WhatsApp Business do Tom, que não é derivável do
 * phone_number_id — por isso uma env var própria.
 */
export const DEFAULT_WHATSAPP_GREETING = 'Oi Tom!';

export class WhatsappNumberNotConfiguredError extends Error {
  constructor() {
    super('TOM_WHATSAPP_NUMBER não configurado — não dá pra gerar o link wa.me ainda.');
    this.name = 'WhatsappNumberNotConfiguredError';
  }
}

/**
 * Gera `https://wa.me/<número>?text=<mensagem>`. Lança
 * WhatsappNumberNotConfiguredError se TOM_WHATSAPP_NUMBER não estiver
 * configurada — melhor falhar visível do que gerar um link morto.
 */
export function buildWhatsappDeepLink(message: string = DEFAULT_WHATSAPP_GREETING): string {
  const number = process.env.TOM_WHATSAPP_NUMBER;
  if (!number) throw new WhatsappNumberNotConfiguredError();

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Mensagem pré-preenchida que o fluxo de indicação já espera (ver REFERRAL_CODE_MESSAGE_PATTERN em orchestrator.ts). */
export function buildReferralWhatsappDeepLink(referralCode: string): string {
  return buildWhatsappDeepLink(`Indicado ${referralCode}`);
}
