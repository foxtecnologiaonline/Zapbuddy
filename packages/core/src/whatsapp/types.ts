/**
 * Referência opaca a uma mídia recebida (áudio, documento, imagem) —
 * carregada através da fila (BullMQ serializa isto em JSON) e devolvida ao
 * mesmo provider que a emitiu via WhatsappChannel.downloadMedia. Nunca
 * interpretar o campo `raw`/`mediaId` fora do provider correspondente.
 */
export type MediaRef =
  | { provider: 'cloud-api'; mediaId: string }
  | { provider: 'evolution'; raw: unknown };

export interface WhatsappChannel {
  readonly provider: MediaRef['provider'];
  sendText(to: string, body: string): Promise<void>;
  downloadMedia(ref: MediaRef): Promise<{ buffer: Buffer; mimeType: string }>;
}
