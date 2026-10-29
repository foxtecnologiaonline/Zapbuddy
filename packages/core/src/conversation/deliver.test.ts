import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const channel = vi.hoisted(() => ({
  sendWhatsappReaction: vi.fn(),
  sendWhatsappTextMessage: vi.fn(),
  sendWhatsappTyping: vi.fn(),
}));
vi.mock('../whatsapp/channel.js', () => channel);
vi.mock('@zapbuddy/db', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { deliverReply } from './deliver.js';

const to = '5511999999999';

beforeEach(() => {
  vi.useFakeTimers();
  channel.sendWhatsappReaction.mockResolvedValue(true);
  channel.sendWhatsappTextMessage.mockResolvedValue(undefined);
  channel.sendWhatsappTyping.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function deliver(input: Parameters<typeof deliverReply>[0]) {
  const promise = deliverReply(input);
  const settled = promise.then(
    () => ({ ok: true as const }),
    (error: Error) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  return settled;
}

describe('deliverReply', () => {
  it('reação enviada: nenhum texto sai', async () => {
    await deliver({ to, waMessageId: 'wamid.1', reply: { text: 'Por nada!', reaction: '❤️' } });
    expect(channel.sendWhatsappReaction).toHaveBeenCalledWith(to, 'wamid.1', '❤️');
    expect(channel.sendWhatsappTextMessage).not.toHaveBeenCalled();
  });

  it('reação que falha cai no texto curto', async () => {
    channel.sendWhatsappReaction.mockResolvedValue(false);
    await deliver({ to, waMessageId: 'wamid.1', reply: { text: 'Por nada!', reaction: '❤️' } });
    expect(channel.sendWhatsappTextMessage).toHaveBeenCalledWith(to, 'Por nada!');
  });

  it('sem id da mensagem não tenta reagir', async () => {
    await deliver({ to, waMessageId: null, reply: { text: 'Por nada!', reaction: '❤️' } });
    expect(channel.sendWhatsappReaction).not.toHaveBeenCalled();
    expect(channel.sendWhatsappTextMessage).toHaveBeenCalledTimes(1);
  });

  it('linha em branco vira balões em ordem, com "digitando…" antes dos seguintes', async () => {
    await deliver({ to, waMessageId: 'wamid.1', reply: { text: 'Anotado!\n\nQuer que eu te lembre?' } });
    expect(channel.sendWhatsappTextMessage.mock.calls.map((call) => call[1])).toEqual(['Anotado!', 'Quer que eu te lembre?']);
    expect(channel.sendWhatsappTyping).toHaveBeenCalledTimes(1);
  });

  it('mais de 3 blocos: o excedente se junta ao último', async () => {
    await deliver({ to, waMessageId: null, reply: { text: 'a\n\nb\n\nc\n\nd' } });
    expect(channel.sendWhatsappTextMessage).toHaveBeenCalledTimes(3);
    expect(channel.sendWhatsappTextMessage.mock.calls[2]![1]).toBe('c\n\nd');
  });

  it('falha no primeiro balão propaga (o retry da fila reenvia tudo)', async () => {
    channel.sendWhatsappTextMessage.mockRejectedValue(new Error('rede'));
    const result = await deliver({ to, waMessageId: null, reply: { text: 'a\n\nb' } });
    expect(result).toMatchObject({ ok: false });
    expect(channel.sendWhatsappTextMessage).toHaveBeenCalledTimes(1);
  });

  it('falha depois do primeiro não propaga (evita duplicar) e tenta o resto num balão só', async () => {
    channel.sendWhatsappTextMessage.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(undefined);
    const result = await deliver({ to, waMessageId: null, reply: { text: 'a\n\nb\n\nc' } });
    expect(result).toEqual({ ok: true });
    expect(channel.sendWhatsappTextMessage.mock.calls.map((call) => call[1])).toEqual(['a', 'b', 'b\n\nc']);
  });

  it('se o resto também falha, só registra', async () => {
    channel.sendWhatsappTextMessage.mockResolvedValueOnce(undefined).mockRejectedValue(new Error('rede'));
    expect(await deliver({ to, waMessageId: null, reply: { text: 'a\n\nb' } })).toEqual({ ok: true });
  });

  it('quebra de linha por frase continua valendo dentro de cada balão', async () => {
    await deliver({ to, waMessageId: null, reply: { text: 'Fechou. Já anotei.' } });
    expect(channel.sendWhatsappTextMessage).toHaveBeenCalledWith(to, 'Fechou.\nJá anotei.');
  });
});
