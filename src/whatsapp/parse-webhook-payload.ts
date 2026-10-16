export interface InboundTextMessage {
  from: string;
  text: string;
  messageId: string;
}

/**
 * Extrai a primeira mensagem de texto do payload do webhook da WhatsApp
 * Cloud API. Retorna null para payloads sem mensagem de texto (status de
 * entrega/leitura, ou tipos não-texto como áudio/imagem, que vão pra fila
 * de transcrição/processamento mais pra frente).
 */
export function parseInboundTextMessage(body: unknown): InboundTextMessage | null {
  const message = (body as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (!message || message.type !== 'text') return null;

  return {
    from: message.from,
    text: message.text.body,
    messageId: message.id,
  };
}
