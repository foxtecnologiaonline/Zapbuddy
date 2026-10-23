import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  claimPendingOutbound: vi.fn(),
  countOutboundSentSince: vi.fn(),
  createPendingOutbound: vi.fn(),
  deleteContact: vi.fn(),
  findContactById: vi.fn(),
  findLatestPendingOutbound: vi.fn(),
  findUserById: vi.fn(),
  isNumberOptedOut: vi.fn(),
  listContacts: vi.fn(),
  listOutboundMessages: vi.fn(),
  markOutboundDispatched: vi.fn(),
  markOutboundFailed: vi.fn(),
  upsertContact: vi.fn(),
}));
const channel = vi.hoisted(() => ({ sendWhatsappTemplate: vi.fn(), sendWhatsappTextTracked: vi.fn() }));
vi.mock('@zapbuddy/db', () => db);
vi.mock('../../whatsapp/channel.js', () => channel);

import {
  deleteContactTool,
  listSentMessagesTool,
  prepareMessageToContactTool,
  saveContactTool,
  sendPreparedMessageTool,
} from './contacts.js';

const ctx = { userId: 'user-1', accountId: 'account-1', turnId: 'turn-2' } as never;
const contact = (name: string, extra: Record<string, unknown> = {}) => ({
  id: `c-${name}`,
  name,
  name_normalized: name.toLowerCase(),
  whatsapp_number: '5511999999999',
  last_inbound_at: null,
  opted_out_at: null,
  ...extra,
});
const pending = (extra: Record<string, unknown> = {}) => ({
  id: 'out-1',
  contact_id: 'c-aline',
  recipient_name: 'Aline',
  recipient_number: '5511999999999',
  body: 'Bom dia!',
  created_turn_id: 'turn-1',
  expires_at: new Date(Date.now() + 600_000).toISOString(),
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WHATSAPP_CONTACT_TEMPLATE_NAME;
  delete process.env.OUTBOUND_DAILY_LIMIT;
  db.countOutboundSentSince.mockResolvedValue(0);
  db.isNumberOptedOut.mockResolvedValue(false);
  db.findUserById.mockResolvedValue({ name: 'Fernando', preferred_name: null });
  db.findContactById.mockResolvedValue(contact('aline'));
  db.claimPendingOutbound.mockResolvedValue(pending());
  channel.sendWhatsappTextTracked.mockResolvedValue({ messageId: 'wamid.1' });
  channel.sendWhatsappTemplate.mockResolvedValue({ messageId: 'wamid.t' });
});

describe('save_contact', () => {
  it('normaliza o número e devolve só o final dele', async () => {
    db.upsertContact.mockResolvedValue({ name: 'Aline' });
    const result = await saveContactTool.execute({ name: 'Aline', whatsapp_number: '(11) 99999-4321' }, ctx);
    expect(db.upsertContact).toHaveBeenCalledWith('account-1', 'user-1', { name: 'Aline', nameNormalized: 'aline', whatsappNumber: '5511999994321' });
    expect(result).toEqual({ saved: true, contact_name: 'Aline', number_hint: '+55 11 9****-4321' });
  });

  it('número inválido não grava nada', async () => {
    expect(await saveContactTool.execute({ name: 'Aline', whatsapp_number: '123456789' }, ctx)).toEqual({ saved: false, reason: 'invalid_number' });
    expect(db.upsertContact).not.toHaveBeenCalled();
  });
});

describe('prepare_message_to_contact', () => {
  it('não envia nada: só deixa o recado pendente, preso ao turno atual', async () => {
    db.listContacts.mockResolvedValue([contact('Aline')]);
    db.createPendingOutbound.mockResolvedValue({});

    const result = await prepareMessageToContactTool.execute({ contact_name: 'aline', message: ' Bom dia! ' }, ctx);

    expect(db.createPendingOutbound).toHaveBeenCalledWith(expect.objectContaining({ turnId: 'turn-2', body: 'Bom dia!', recipientName: 'Aline' }));
    expect(channel.sendWhatsappTextTracked).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'awaiting_confirmation', to: 'Aline', message: 'Bom dia!' });
  });

  it('contato inexistente, ambíguo, descadastrado e limite diário não criam pendência', async () => {
    db.listContacts.mockResolvedValue([contact('Aline Souza'), contact('Alice Lima')]);
    expect(await prepareMessageToContactTool.execute({ contact_name: 'Carlos', message: 'oi' }, ctx)).toEqual({ status: 'contact_not_found' });
    expect(await prepareMessageToContactTool.execute({ contact_name: 'Ali', message: 'oi' }, ctx)).toMatchObject({ status: 'ambiguous' });

    db.listContacts.mockResolvedValue([contact('Aline', { opted_out_at: '2026-10-01T00:00:00Z' })]);
    expect(await prepareMessageToContactTool.execute({ contact_name: 'Aline', message: 'oi' }, ctx)).toMatchObject({ status: 'contact_opted_out' });

    db.listContacts.mockResolvedValue([contact('Aline')]);
    db.countOutboundSentSince.mockResolvedValue(20);
    expect(await prepareMessageToContactTool.execute({ contact_name: 'Aline', message: 'oi' }, ctx)).toMatchObject({ status: 'daily_limit_reached', limit: 20 });
    expect(db.createPendingOutbound).not.toHaveBeenCalled();
  });
});

describe('send_prepared_message', () => {
  it('RECUSA confirmar no mesmo turno em que preparou (a pessoa precisa responder antes)', async () => {
    db.findLatestPendingOutbound.mockResolvedValue(pending({ created_turn_id: 'turn-2' }));
    expect(await sendPreparedMessageTool.execute({}, ctx)).toEqual({ sent: false, reason: 'needs_confirmation_from_person' });
    expect(db.claimPendingOutbound).not.toHaveBeenCalled();
    expect(channel.sendWhatsappTextTracked).not.toHaveBeenCalled();
  });

  it('sem pendência, expirado, descadastrado ou limite: não envia', async () => {
    db.findLatestPendingOutbound.mockResolvedValueOnce(null);
    expect(await sendPreparedMessageTool.execute({}, ctx)).toEqual({ sent: false, reason: 'nothing_pending' });

    db.findLatestPendingOutbound.mockResolvedValueOnce(pending({ expires_at: new Date(Date.now() - 1000).toISOString() }));
    expect(await sendPreparedMessageTool.execute({}, ctx)).toEqual({ sent: false, reason: 'confirmation_expired' });

    db.findLatestPendingOutbound.mockResolvedValueOnce(pending());
    db.isNumberOptedOut.mockResolvedValueOnce(true);
    expect(await sendPreparedMessageTool.execute({}, ctx)).toEqual({ sent: false, reason: 'contact_opted_out' });

    db.findLatestPendingOutbound.mockResolvedValueOnce(pending());
    db.countOutboundSentSince.mockResolvedValueOnce(20);
    expect(await sendPreparedMessageTool.execute({}, ctx)).toEqual({ sent: false, reason: 'daily_limit_reached' });
    expect(channel.sendWhatsappTextTracked).not.toHaveBeenCalled();
  });

  it('envia texto identificando quem pediu e guarda o id da mensagem pra acompanhar entrega', async () => {
    db.findLatestPendingOutbound.mockResolvedValue(pending());

    const result = await sendPreparedMessageTool.execute({}, ctx);

    const [to, text] = channel.sendWhatsappTextTracked.mock.calls[0]!;
    expect(to).toBe('5511999999999');
    expect(text).toContain('Bom dia!');
    expect(text).toContain('Fernando, via Tom (assistente pessoal)');
    expect(db.markOutboundDispatched).toHaveBeenCalledWith('out-1', { waMessageId: 'wamid.1', sendMode: 'free_form' });
    expect(result).toEqual({ sent: true, to: 'Aline', mode: 'free_form' });
  });

  it('quem perdeu a corrida pelo recado (já reivindicado) não envia de novo', async () => {
    db.findLatestPendingOutbound.mockResolvedValue(pending());
    db.claimPendingOutbound.mockResolvedValue(null);
    expect(await sendPreparedMessageTool.execute({}, ctx)).toEqual({ sent: false, reason: 'already_handled' });
    expect(channel.sendWhatsappTextTracked).not.toHaveBeenCalled();
  });

  it('janela fechada + template configurado → template com nome e recado como variáveis', async () => {
    process.env.WHATSAPP_CONTACT_TEMPLATE_NAME = 'tom_recado';
    db.findLatestPendingOutbound.mockResolvedValue(pending({ body: 'Oi\nAline' }));

    const result = await sendPreparedMessageTool.execute({}, ctx);

    expect(channel.sendWhatsappTemplate).toHaveBeenCalledWith('5511999999999', { name: 'tom_recado', languageCode: 'pt_BR', bodyParams: ['Fernando', 'Oi Aline'] });
    expect(channel.sendWhatsappTextTracked).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sent: true, mode: 'template' });
  });

  it('erro 131047 no texto livre cai no template, se houver', async () => {
    process.env.WHATSAPP_CONTACT_TEMPLATE_NAME = 'tom_recado';
    db.findContactById.mockResolvedValue(contact('aline', { last_inbound_at: new Date().toISOString() }));
    db.findLatestPendingOutbound.mockResolvedValue(pending());
    channel.sendWhatsappTextTracked.mockRejectedValue(new Error('WhatsApp send failed (400): code 131047'));

    const result = await sendPreparedMessageTool.execute({}, ctx);

    expect(channel.sendWhatsappTemplate).toHaveBeenCalled();
    expect(db.markOutboundDispatched).toHaveBeenCalledWith('out-1', { waMessageId: 'wamid.t', sendMode: 'template' });
    expect(result).toMatchObject({ sent: true, mode: 'template' });
  });

  it('falha sem template: marca failed no log e explica o motivo', async () => {
    db.findLatestPendingOutbound.mockResolvedValue(pending());
    channel.sendWhatsappTextTracked.mockRejectedValue(new Error('WhatsApp send failed (400): code 131047'));

    const result = await sendPreparedMessageTool.execute({}, ctx);

    expect(db.markOutboundFailed).toHaveBeenCalledWith('out-1', expect.stringContaining('131047'));
    expect(result).toEqual({ sent: false, reason: 'outside_24h_window' });
  });
});

describe('delete_contact e list_sent_messages', () => {
  it('delete_contact pergunta quando há mais de um', async () => {
    db.listContacts.mockResolvedValue([contact('Aline Souza'), contact('Alice Lima')]);
    expect(await deleteContactTool.execute({ name: 'Ali' }, ctx)).toMatchObject({ deleted: false, reason: 'ambiguous' });
    expect(db.deleteContact).not.toHaveBeenCalled();
  });

  it('list_sent_messages resume status e respostas, filtrando por contato', async () => {
    db.listOutboundMessages.mockResolvedValue([
      { recipient_name: 'Aline', body: 'Bom dia!', status: 'read', sent_at: 's', read_at: 'r', failed_reason: null, replies: [{ message_type: 'text', body: 'Bom dia!!', created_at: 't' }] },
      { recipient_name: 'João', body: 'Oi', status: 'delivered', sent_at: 's', read_at: null, failed_reason: null, replies: [] },
    ]);

    const result = (await listSentMessagesTool.execute({ contact_name: 'aline' }, ctx)) as { messages: Array<Record<string, unknown>> };

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ to: 'Aline', status: 'read', replied: true, replies: [{ type: 'text', text: 'Bom dia!!', at: 't' }] });
  });
});
