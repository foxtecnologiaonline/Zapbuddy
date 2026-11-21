import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  class InvalidWhatsappNumberError extends Error {}
  return {
    InvalidWhatsappNumberError,
    getOrCreateUser: vi.fn(),
    logError: vi.fn(),
    logWebhookEvent: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});
const core = vi.hoisted(() => ({
  isRateLimited: vi.fn(),
  messageAdd: vi.fn(),
  audioAdd: vi.fn(),
  documentAdd: vi.fn(),
  formatSharedContactText: vi.fn(),
}));

vi.mock('@zapbuddy/db', () => db);
vi.mock('@zapbuddy/core', () => ({
  isRateLimited: core.isRateLimited,
  formatSharedContactText: core.formatSharedContactText,
  getIncomingMessageQueue: () => ({ add: core.messageAdd }),
  getAudioTranscriptionQueue: () => ({ add: core.audioAdd }),
  getDocumentUploadQueue: () => ({ add: core.documentAdd }),
}));

import { POST } from './route.js';

const SECRET = 'segredo-de-teste';

function post(messages: unknown[], { signed = true }: { signed?: boolean } = {}) {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages } }] }] });
  const signature = `sha256=${createHmac('sha256', signed ? SECRET : 'outro').update(body).digest('hex')}`;
  return POST(new Request('https://x.test/api/whatsapp/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': signature } }) as never);
}

const text = (id: string, from = '5511999990000') => ({ id, from, type: 'text', text: { body: 'oi' } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WHATSAPP_APP_SECRET = SECRET;
  db.getOrCreateUser.mockImplementation(async (number: string) => ({ id: `u-${number}`, whatsapp_number: number }));
  db.logError.mockResolvedValue(undefined);
  db.logWebhookEvent.mockResolvedValue(undefined);
  core.isRateLimited.mockResolvedValue(false);
  core.messageAdd.mockResolvedValue(undefined);
});

describe('webhook Cloud API', () => {
  it('assinatura inválida: 403 e nada entra na fila', async () => {
    const response = await post([text('wamid.1')], { signed: false });
    expect(response.status).toBe(403);
    expect(core.messageAdd).not.toHaveBeenCalled();
  });

  it('mensagem de texto entra na fila com o id da mensagem como jobId (dedupe de reentrega) e responde 200', async () => {
    const response = await post([text('wamid.1')]);
    expect(response.status).toBe(200);
    expect(core.messageAdd).toHaveBeenCalledWith('process', expect.objectContaining({ waMessageId: 'wamid.1' }), { jobId: 'wamid.1' });
  });

  it('fila fora do ar (ex.: cota do Redis): 500, pra Meta reentregar — antes era 200 e a mensagem se perdia', async () => {
    core.messageAdd.mockRejectedValueOnce(new Error('max requests limit exceeded'));
    const response = await post([text('wamid.1')]);
    expect(response.status).toBe(500);
    expect(db.logger.error).toHaveBeenCalledWith('webhook_message_failed', expect.objectContaining({ waMessageId: 'wamid.1' }));
  });

  it('banco fora do ar E o log de erro também falhando: continua 500 (não estoura exceção) e as outras mensagens do lote seguem', async () => {
    db.getOrCreateUser.mockRejectedValueOnce(new Error('db down'));
    db.logError.mockRejectedValue(new Error('db down'));
    const response = await post([text('wamid.1', '5511111110000'), text('wamid.2', '5511222220000')]);
    expect(response.status).toBe(500);
    expect(core.messageAdd).toHaveBeenCalledTimes(1);
    expect(core.messageAdd).toHaveBeenCalledWith('process', expect.objectContaining({ waMessageId: 'wamid.2' }), { jobId: 'wamid.2' });
  });

  it('número inválido não é falha de infra: 200 (reentregar não adiantaria)', async () => {
    db.getOrCreateUser.mockRejectedValueOnce(new db.InvalidWhatsappNumberError('inválido'));
    const response = await post([text('wamid.1')]);
    expect(response.status).toBe(200);
    expect(core.messageAdd).not.toHaveBeenCalled();
  });

  it('limite de mensagens por minuto: 200 e descarta (reentregar só pioraria a enxurrada)', async () => {
    core.isRateLimited.mockResolvedValueOnce(true);
    const response = await post([text('wamid.1')]);
    expect(response.status).toBe(200);
    expect(core.messageAdd).not.toHaveBeenCalled();
  });

  it('tipo sem suporte (figurinha, localização): 200 sem enfileirar', async () => {
    const response = await post([{ id: 'wamid.9', from: '5511999990000', type: 'sticker' }]);
    expect(response.status).toBe(200);
    expect(core.messageAdd).not.toHaveBeenCalled();
  });
});
