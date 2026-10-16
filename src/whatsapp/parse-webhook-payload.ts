export interface InboundMessage {
  from: string;
  messageId: string;
  type: string;
  text: string | null;
}

/**
 * Extrai a mensagem recebida no payload do webhook da WhatsApp Cloud API.
 * Retorna null só quando não há mensagem nenhuma (ex: status de
 * entrega/leitura). Qualquer tipo de mensagem (texto, áudio, imagem...)
 * é retornado — quem decide se cadastra/responde é o chamador; isso
 * garante que resolveClientForInboundMessage rode pra todo primeiro
 * contato, não só quando a pessoa manda texto.
 */
export function parseInboundMessage(body: unknown): InboundMessage | null {
  const message = (body as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (!message) return null;

  return {
    from: message.from,
    messageId: message.id,
    type: message.type,
    text: message.type === 'text' ? message.text.body : null,
  };
}
