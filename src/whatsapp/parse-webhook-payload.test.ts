import { describe, it, expect } from 'vitest';
import { parseInboundMessage } from './parse-webhook-payload';

function buildPayload(message: unknown) {
  return { entry: [{ changes: [{ value: { messages: [message] } }] }] };
}

describe('parseInboundMessage', () => {
  it('extrai mensagem de texto', () => {
    const result = parseInboundMessage(
      buildPayload({ from: '5511999999999', id: 'wamid.1', type: 'text', text: { body: 'oi' } }),
    );
    expect(result).toEqual({ from: '5511999999999', messageId: 'wamid.1', type: 'text', text: 'oi' });
  });

  it('resolve mensagens não-texto (áudio) em vez de descartar', () => {
    const result = parseInboundMessage(
      buildPayload({ from: '5511999999999', id: 'wamid.2', type: 'audio', audio: { id: 'media123' } }),
    );
    expect(result).toEqual({ from: '5511999999999', messageId: 'wamid.2', type: 'audio', text: null });
  });

  it('ignora payload sem mensagem (status de entrega/leitura)', () => {
    const statusUpdate = { entry: [{ changes: [{ value: { statuses: [{ status: 'delivered' }] } }] }] };
    expect(parseInboundMessage(statusUpdate)).toBeNull();
  });

  it('ignora payload vazio', () => {
    expect(parseInboundMessage({})).toBeNull();
  });
});
