import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudApiChannel } from './cloud-api-channel.js';
import { WhatsappWindowClosedError } from './template.js';

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const reply = (status: number, body: string) => ({ ok: status < 400, status, text: async () => body }) as unknown as Response;

describe('CloudApiChannel.sendText', () => {
  it('erro 131047 da Meta (janela de 24h fechada) vira WhatsappWindowClosedError, que o lembrete usa pra cair no template', async () => {
    global.fetch = vi.fn().mockResolvedValue(reply(400, '{"error":{"message":"(#131047) Re-engagement message","type":"OAuthException","code":131047}}')) as unknown as typeof fetch;

    await expect(new CloudApiChannel().sendText('5511999990000', 'oi')).rejects.toBeInstanceOf(WhatsappWindowClosedError);
  });

  it('qualquer outro erro continua sendo um Error comum (não dispara o caminho do template)', async () => {
    global.fetch = vi.fn().mockResolvedValue(reply(400, '{"error":{"message":"(#131026) Message undeliverable","code":131026}}')) as unknown as typeof fetch;

    const error = await new CloudApiChannel().sendText('55', 'oi').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(WhatsappWindowClosedError);
    expect((error as Error).message).toContain('131026');
  });

  it('sucesso: POST de texto no número certo, sem mudança de comportamento', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(200, '{}'));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await new CloudApiChannel().sendText('5511999990000', 'oi');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/123/messages');
    expect(JSON.parse(init.body as string)).toEqual({ messaging_product: 'whatsapp', to: '5511999990000', type: 'text', text: { body: 'oi' } });
  });
});

describe('CloudApiChannel.sendTemplate', () => {
  it('posta o template com o corpo sanitizado', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(200, '{}'));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await new CloudApiChannel().sendTemplate('5511999990000', { name: 'tom_lembrete', language: 'pt_BR', bodyParams: ['ligar\npro João'] });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/123/messages');
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('tom_lembrete');
    expect(body.template.components[0].parameters[0].text).toBe('ligar pro João');
  });

  it('template recusado pela Meta (ex.: não aprovado) lança com o motivo, pra o retry do job e o log mostrarem', async () => {
    global.fetch = vi.fn().mockResolvedValue(reply(400, '{"error":{"message":"(#132001) Template does not exist","code":132001}}')) as unknown as typeof fetch;
    await expect(new CloudApiChannel().sendTemplate('55', { name: 'x', language: 'pt_BR', bodyParams: ['a'] })).rejects.toThrow('132001');
  });
});
