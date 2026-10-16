import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendWhatsAppTextMessage, WhatsAppApiError } from './send-message';

beforeEach(() => {
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'pn123';
  process.env.WHATSAPP_ACCESS_TOKEN = 'token123';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(ok: boolean, status: number, body = '{}'): Response {
  return { ok, status, text: async () => body } as Response;
}

describe('sendWhatsAppTextMessage', () => {
  it('sucesso de primeira não faz retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(true, 200));
    vi.stubGlobal('fetch', fetchMock);

    await sendWhatsAppTextMessage('5511999999999', 'oi');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retry em 5xx: falha uma vez, sucede na segunda', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(false, 503, 'service unavailable'))
      .mockResolvedValueOnce(jsonResponse(true, 200));
    vi.stubGlobal('fetch', fetchMock);

    await sendWhatsAppTextMessage('5511999999999', 'oi');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('4xx nunca faz retry e propaga o erro imediatamente', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(false, 401, 'invalid token'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendWhatsAppTextMessage('5511999999999', 'oi')).rejects.toThrow(WhatsAppApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('5xx nas duas tentativas propaga o erro depois de esgotar o retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(false, 500, 'internal error'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendWhatsAppTextMessage('5511999999999', 'oi')).rejects.toThrow(WhatsAppApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falha de rede (reject) na 1ª tentativa também faz retry', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(jsonResponse(true, 200));
    vi.stubGlobal('fetch', fetchMock);

    await sendWhatsAppTextMessage('5511999999999', 'oi');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('erro de configuração (sem credenciais) nunca chega a chamar fetch', async () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendWhatsAppTextMessage('5511999999999', 'oi')).rejects.toThrow(/obrigatórios/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
