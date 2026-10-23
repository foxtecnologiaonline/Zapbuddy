/**
 * Referência opaca a uma mídia recebida (áudio, documento, imagem) —
 * carregada através da fila (BullMQ serializa isto em JSON) e devolvida ao
 * mesmo provider que a emitiu via WhatsappChannel.downloadMedia. Nunca
 * interpretar o campo `raw`/`mediaId` fora do provider correspondente.
 */
export type MediaRef =
  | { provider: 'cloud-api'; mediaId: string }
  | { provider: 'evolution'; raw: unknown };

export interface ConnectionCheck {
  ok: boolean;
  detail?: string;
  /** Número (só dígitos, com DDI+DDD) do WhatsApp conectado nesse canal — usado pro card de status do admin mostrar qual número é, não só se está online. */
  number?: string;
}

export interface SentMessageInfo {
  /** Id da mensagem no provedor (wamid na Cloud API) — é o que os webhooks de status (entregue/lida/falhou) devolvem. Null se o provedor não informa. */
  messageId: string | null;
}

export interface TemplateMessage {
  name: string;
  languageCode: string;
  /** Variáveis do corpo do template, na ordem ({{1}}, {{2}}...). */
  bodyParams: string[];
}

export interface WhatsappChannel {
  readonly provider: MediaRef['provider'];
  sendText(to: string, body: string): Promise<void>;
  /** Igual a sendText, mas devolve o id da mensagem — usado pelos recados a terceiros, que precisam acompanhar entrega/leitura. */
  sendTextTracked(to: string, body: string): Promise<SentMessageInfo>;
  /** Mensagem de template aprovado pela Meta — a única que pode abrir conversa fora da janela de 24h. Só a Cloud API suporta. */
  sendTemplate(to: string, template: TemplateMessage): Promise<SentMessageInfo>;
  downloadMedia(ref: MediaRef): Promise<{ buffer: Buffer; mimeType: string }>;
  /** Usado só pelo card de status do admin — nunca lançar, sempre devolver { ok: false, detail } em erro. */
  checkConnection(): Promise<ConnectionCheck>;
}
