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

export interface WhatsappChannel {
  readonly provider: MediaRef['provider'];
  sendText(to: string, body: string): Promise<void>;
  downloadMedia(ref: MediaRef): Promise<{ buffer: Buffer; mimeType: string }>;
  /** Usado só pelo card de status do admin — nunca lançar, sempre devolver { ok: false, detail } em erro. */
  checkConnection(): Promise<ConnectionCheck>;
}
