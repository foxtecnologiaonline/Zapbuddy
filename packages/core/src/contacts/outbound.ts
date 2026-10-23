/**
 * Regras puras do recado a terceiro (sem rede e sem banco → testáveis):
 * texto que vai pra pessoa, decisão texto-livre × template e leitura dos
 * códigos de erro da Meta.
 */

/** Janela de atendimento da Meta é 24h; 1h de folga pra não apostar no limite do relógio. */
const FREE_FORM_WINDOW_MS = 23 * 60 * 60_000;

/** Quanto tempo o recado aguarda o "sim" antes de expirar. */
export const CONFIRMATION_TTL_MS = 15 * 60_000;

/** Respostas a um recado só são atribuídas a ele por esta janela (depois disso a pessoa vira, de novo, um desconhecido). */
export const REPLY_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60_000;

export const DEFAULT_OUTBOUND_DAILY_LIMIT = 20;

/**
 * Sempre identifica de quem é o recado e que veio de um assistente — o Tom
 * nunca se passa pela pessoa (transparência com quem recebe, e exigência de
 * bom uso do número comercial da Meta).
 */
export function composeOutboundText(senderName: string, body: string): string {
  return `${body.trim()}\n\n— ${senderName}, via Tom (assistente pessoal). Pode responder aqui que eu aviso.`;
}

/** Variáveis de template da Meta não aceitam quebra de linha, tab nem 4+ espaços seguidos, e têm teto de tamanho. */
export function sanitizeTemplateParam(value: string, max = 900): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max);
}

export type SendMode = 'free_form' | 'template';

/**
 * Texto livre só é aceito pela Meta se o número falou com o Tom nas últimas
 * 24h; fora da janela só template aprovado. Sem template configurado,
 * tentamos texto livre mesmo assim (a Meta rejeita com 131047 se a janela
 * estiver fechada de fato e o erro vira uma explicação clara pra pessoa) — o
 * que é melhor que bloquear às cegas quem JÁ conversou com o Tom por outro
 * caminho (ex.: também é usuária).
 */
export function chooseSendMode(input: { lastInboundAtIso: string | null; templateConfigured: boolean; now?: Date }): SendMode {
  const now = (input.now ?? new Date()).getTime();
  const windowOpen = input.lastInboundAtIso !== null && now - new Date(input.lastInboundAtIso).getTime() < FREE_FORM_WINDOW_MS;
  if (windowOpen || !input.templateConfigured) return 'free_form';
  return 'template';
}

/** 131047 = "re-engagement message": texto livre fora da janela de 24h. */
export function isOutsideWindowError(errorMessage: string): boolean {
  return errorMessage.includes('131047');
}

/** Motivo curto, em português, pra o Tom explicar uma falha sem despejar JSON da Meta. */
export function describeSendFailure(errorMessage: string): string {
  if (isOutsideWindowError(errorMessage)) return 'outside_24h_window';
  if (errorMessage.includes('131026')) return 'number_not_on_whatsapp';
  if (errorMessage.includes('131049') || errorMessage.includes('130472')) return 'blocked_by_meta_policy';
  return 'send_failed';
}

export const OPT_OUT_PATTERN = /^\s*(parar|pare|sair|stop|cancelar|descadastrar)\s*[.!]?\s*$/i;
