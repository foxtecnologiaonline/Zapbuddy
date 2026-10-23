import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  createMessageDraft: vi.fn(),
  deleteContact: vi.fn(),
  listContacts: vi.fn(),
  listMessageDrafts: vi.fn(),
  updateMessageDraft: vi.fn(),
  upsertContact: vi.fn(),
}));
vi.mock('@zapbuddy/db', () => db);

import {
  deleteContactTool,
  draftMessageForContactTool,
  listMessageLogTool,
  saveContactTool,
  updateMessageStatusTool,
} from './contacts.js';

const ctx = { userId: 'user-1', accountId: 'account-1' } as never;
const contact = (name: string, number = '5511999999999') => ({ id: `c-${name}`, name, name_normalized: name.toLowerCase(), whatsapp_number: number });
const draft = (recipient: string | null, extra: Record<string, unknown> = {}) => ({
  id: `d-${recipient}`,
  recipient_name: recipient,
  body: 'Bom dia!',
  status: 'draft',
  reply_note: null,
  created_at: '2026-10-23T10:00:00Z',
  ...extra,
});

beforeEach(() => vi.clearAllMocks());

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

describe('draft_message_for_contact', () => {
  it('contato salvo: devolve o texto e o link direto na conversa, e registra o rascunho', async () => {
    db.listContacts.mockResolvedValue([contact('Aline')]);

    const result = await draftMessageForContactTool.execute({ contact_name: 'aline', message: ' Bom dia, Aline! ' }, ctx);

    expect(result).toEqual({
      status: 'ready',
      to: 'Aline',
      contact_saved: true,
      message: 'Bom dia, Aline!',
      link: 'https://wa.me/5511999999999?text=Bom%20dia%2C%20Aline!',
    });
    expect(db.createMessageDraft).toHaveBeenCalledWith({ accountId: 'account-1', userId: 'user-1', contactId: 'c-Aline', recipientName: 'Aline', body: 'Bom dia, Aline!' });
  });

  it('contato desconhecido: ainda entrega o texto, com link que deixa escolher a conversa', async () => {
    db.listContacts.mockResolvedValue([contact('João')]);

    const result = await draftMessageForContactTool.execute({ contact_name: 'Carlos', message: 'Oi' }, ctx);

    expect(result).toEqual({ status: 'ready', to: 'Carlos', contact_saved: false, message: 'Oi', link: 'https://wa.me/?text=Oi' });
    expect(db.createMessageDraft).toHaveBeenCalledWith(expect.objectContaining({ contactId: null, recipientName: 'Carlos' }));
  });

  it('sem destinatário informado também funciona', async () => {
    const result = await draftMessageForContactTool.execute({ message: 'Feliz aniversário!' }, ctx);
    expect(result).toMatchObject({ status: 'ready', to: null, contact_saved: false });
    expect(db.listContacts).not.toHaveBeenCalled();
  });

  it('nome ambíguo: pergunta qual e não registra nada', async () => {
    db.listContacts.mockResolvedValue([contact('Aline Souza'), contact('Alice Lima', '5511988887777')]);
    const result = await draftMessageForContactTool.execute({ contact_name: 'Ali', message: 'Oi' }, ctx);
    expect(result).toMatchObject({ status: 'ambiguous', candidates: ['Aline Souza', 'Alice Lima'] });
    expect(db.createMessageDraft).not.toHaveBeenCalled();
  });

  it('o texto com acento, emoji e quebra de linha sobrevive no link', async () => {
    db.listContacts.mockResolvedValue([contact('Aline')]);
    const result = (await draftMessageForContactTool.execute({ contact_name: 'Aline', message: 'Café & pão 😀\nvamos?' }, ctx)) as { link: string };
    expect(new URL(result.link).searchParams.get('text')).toBe('Café & pão 😀\nvamos?');
  });
});

describe('update_message_status', () => {
  it('atualiza o recado mais recente do contato citado', async () => {
    db.listMessageDrafts.mockResolvedValue([draft('João'), draft('Aline')]);
    const result = await updateMessageStatusTool.execute({ contact_name: 'aline', status: 'replied', reply_summary: 'Disse que vai passar aqui' }, ctx);
    expect(db.updateMessageDraft).toHaveBeenCalledWith('account-1', 'd-Aline', { status: 'replied', replyNote: 'Disse que vai passar aqui' });
    expect(result).toEqual({ updated: true, to: 'Aline', status: 'replied' });
  });

  it('sem contato citado atualiza o último recado', async () => {
    db.listMessageDrafts.mockResolvedValue([draft('João'), draft('Aline')]);
    await updateMessageStatusTool.execute({ status: 'sent' }, ctx);
    expect(db.updateMessageDraft).toHaveBeenCalledWith('account-1', 'd-João', { status: 'sent', replyNote: undefined });
  });

  it('nenhum recado do contato → não inventa', async () => {
    db.listMessageDrafts.mockResolvedValue([draft('João')]);
    expect(await updateMessageStatusTool.execute({ contact_name: 'Aline', status: 'sent' }, ctx)).toEqual({ updated: false, reason: 'no_message_found' });
    expect(db.updateMessageDraft).not.toHaveBeenCalled();
  });
});

describe('list_message_log e delete_contact', () => {
  it('lista os recados do contato com o que a pessoa informou', async () => {
    db.listMessageDrafts.mockResolvedValue([draft('Aline', { status: 'replied', reply_note: 'Ok!' }), draft('João')]);
    const result = (await listMessageLogTool.execute({ contact_name: 'aline' }, ctx)) as { messages: unknown[] };
    expect(result.messages).toEqual([{ to: 'Aline', message: 'Bom dia!', status: 'replied', reply_summary: 'Ok!', created_at: '2026-10-23T10:00:00Z' }]);
  });

  it('delete_contact pergunta quando há mais de um', async () => {
    db.listContacts.mockResolvedValue([contact('Aline Souza'), contact('Alice Lima', '5511988887777')]);
    expect(await deleteContactTool.execute({ name: 'Ali' }, ctx)).toMatchObject({ deleted: false, reason: 'ambiguous' });
    expect(db.deleteContact).not.toHaveBeenCalled();
  });
});
