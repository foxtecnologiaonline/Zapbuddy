import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  applyDeliveryStatus: vi.fn(),
  findRecentOutboundToNumbers: vi.fn(),
  findUserById: vi.fn(),
  findUserByWhatsappNumber: vi.fn(),
  insertOutboundReply: vi.fn(),
  markContactsInbound: vi.fn(),
  markNumberOptedOut: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const channel = vi.hoisted(() => ({ sendWhatsappTextMessage: vi.fn() }));
const context = vi.hoisted(() => ({ appendTurns: vi.fn() }));
vi.mock('@zapbuddy/db', () => db);
vi.mock('../whatsapp/channel.js', () => channel);
vi.mock('../context/conversation-context.js', () => context);

import { applyDeliveryStatuses, formatReplyNotification, formatSharedContactText, routeRecipientReply } from './replies.js';

const outbound = { id: 'out-1', account_id: 'acc-1', user_id: 'user-1', recipient_name: 'Aline' };
const reply = (text: string, extra: Record<string, unknown> = {}) => ({ id: 'wamid.in1', from: '5511999999999', type: 'text', text, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  db.findUserByWhatsappNumber.mockResolvedValue(null);
  db.findRecentOutboundToNumbers.mockResolvedValue(outbound);
  db.insertOutboundReply.mockResolvedValue({ id: 'r1' });
  db.findUserById.mockResolvedValue({ whatsapp_number: '5511888887777' });
  db.markContactsInbound.mockResolvedValue(undefined);
  channel.sendWhatsappTextMessage.mockResolvedValue(undefined);
});

describe('routeRecipientReply', () => {
  it('resposta de quem não é usuário: registra, avisa quem pediu e NÃO deixa virar conta nova', async () => {
    expect(await routeRecipientReply(reply('Bom dia!! tudo bem?'))).toBe(true);

    expect(db.insertOutboundReply).toHaveBeenCalledWith({ outboundMessageId: 'out-1', accountId: 'acc-1', waMessageId: 'wamid.in1', messageType: 'text', body: 'Bom dia!! tudo bem?' });
    expect(channel.sendWhatsappTextMessage).toHaveBeenCalledWith('5511888887777', '📩 Aline respondeu: "Bom dia!! tudo bem?"');
    expect(context.appendTurns).toHaveBeenCalledWith('5511888887777', [expect.objectContaining({ role: 'assistant', content: expect.stringContaining('Aline respondeu') })]);
    expect(db.markContactsInbound).toHaveBeenCalled();
  });

  it('quem já é usuário do Tom segue o fluxo normal (não é tratado como resposta)', async () => {
    db.findUserByWhatsappNumber.mockResolvedValueOnce({ id: 'u' });
    expect(await routeRecipientReply(reply('oi'))).toBe(false);
    expect(db.insertOutboundReply).not.toHaveBeenCalled();
  });

  it('número sem recado recente é um desconhecido de verdade: fluxo normal (cadastro)', async () => {
    db.findRecentOutboundToNumbers.mockResolvedValue(null);
    expect(await routeRecipientReply(reply('oi tom'))).toBe(false);
  });

  it('procura as duas variantes do número (com e sem o nono dígito)', async () => {
    await routeRecipientReply(reply('oi', { from: '551199999999' }));
    expect(db.findRecentOutboundToNumbers.mock.calls[0]![0]).toEqual(['551199999999', '5511999999999']);
  });

  it('reentrega do webhook (resposta já registrada) não avisa de novo', async () => {
    db.insertOutboundReply.mockResolvedValue(null);
    expect(await routeRecipientReply(reply('oi'))).toBe(true);
    expect(channel.sendWhatsappTextMessage).not.toHaveBeenCalled();
  });

  it('PARAR descadastra o número, confirma pra ela e avisa quem pediu', async () => {
    expect(await routeRecipientReply(reply('PARAR'))).toBe(true);

    expect(db.markNumberOptedOut).toHaveBeenCalled();
    const sent = channel.sendWhatsappTextMessage.mock.calls.map(([to]) => to);
    expect(sent).toEqual(['5511999999999', '5511888887777']);
    expect(channel.sendWhatsappTextMessage.mock.calls[1]![1]).toContain('pediu pra não receber mais recados');
  });

  it('falha ao avisar quem pediu não perde a resposta (já está salva)', async () => {
    channel.sendWhatsappTextMessage.mockRejectedValue(new Error('fora da janela'));
    await expect(routeRecipientReply(reply('oi'))).resolves.toBe(true);
    expect(db.insertOutboundReply).toHaveBeenCalled();
  });
});

describe('formatReplyNotification', () => {
  it('mídia que o Tom não lê só avisa', () => {
    expect(formatReplyNotification('Aline', { type: 'audio', body: null, optedOut: false })).toContain('respondeu com um áudio');
  });
  it('colapsa quebras de linha e limita o tamanho', () => {
    const text = formatReplyNotification('Aline', { type: 'text', body: `a\n\n${'x'.repeat(1000)}`, optedOut: false });
    expect(text).not.toContain('\n');
    expect(text.length).toBeLessThan(450);
  });
});

describe('applyDeliveryStatuses', () => {
  it('entregue e lido atualizam o log; sent é ignorado; falha guarda o motivo', async () => {
    await applyDeliveryStatuses([
      { id: 'w1', status: 'sent', timestamp: '1792749000' },
      { id: 'w1', status: 'delivered', timestamp: '1792749001' },
      { id: 'w1', status: 'read', timestamp: '1792749002' },
      { id: 'w2', status: 'failed', errors: [{ code: 131026, title: 'Message undeliverable' }] },
    ]);
    expect(db.applyDeliveryStatus).toHaveBeenCalledTimes(3);
    expect(db.applyDeliveryStatus).toHaveBeenCalledWith('w1', { status: 'delivered', atIso: new Date(1792749001 * 1000).toISOString() });
    expect(db.applyDeliveryStatus).toHaveBeenCalledWith('w2', { status: 'failed', reason: '131026 Message undeliverable' });
  });

  it('nunca lança (não pode derrubar o webhook)', async () => {
    db.applyDeliveryStatus.mockRejectedValue(new Error('db fora'));
    await expect(applyDeliveryStatuses([{ id: 'w1', status: 'read' }])).resolves.toBeUndefined();
  });
});

describe('formatSharedContactText', () => {
  it('monta o texto do cartão, marcado como dado, e saneia o nome', () => {
    const text = formatSharedContactText([{ name: { formatted_name: 'Aline\nSouza' }, phones: [{ phone: '+55 11 99999-9999', wa_id: '5511999999999' }] }]);
    expect(text).toContain('não instrução');
    expect(text).toContain('- Aline Souza: 5511999999999');
  });
  it('cartão sem nome ou telefone vira null', () => {
    expect(formatSharedContactText([{ name: { formatted_name: 'Sem fone' } }])).toBeNull();
  });
});
