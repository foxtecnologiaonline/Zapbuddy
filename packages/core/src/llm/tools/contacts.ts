import { z } from 'zod';
import { createMessageDraft, deleteContact, listContacts, listMessageDrafts, updateMessageDraft, upsertContact } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { buildWhatsappComposeLink } from '../../contacts/compose.js';
import { matchContactByName, normalizeContactName } from '../../contacts/matching.js';
import { maskWhatsappNumber, normalizeBrazilianWhatsappNumber } from '../../contacts/phone.js';

export const saveContactTool = defineTool({
  name: 'save_contact',
  description:
    'Salva/corrige contato (nome + WhatsApp do Brasil) pro link dos recados abrir na conversa certa. Use quando ela disser o número ou encaminhar um cartão "[Contato compartilhado ...]".',
  schema: z.object({
    name: z.string().min(1).max(80),
    whatsapp_number: z.string().min(8).max(25),
  }),
  execute: async (params, ctx) => {
    const number = normalizeBrazilianWhatsappNumber(params.whatsapp_number);
    if (!number) return { saved: false, reason: 'invalid_number' };

    const contact = await upsertContact(ctx.accountId, ctx.userId, {
      name: params.name.trim(),
      nameNormalized: normalizeContactName(params.name),
      whatsappNumber: number,
    });
    return { saved: true, contact_name: contact.name, number_hint: maskWhatsappNumber(number) };
  },
});

export const listContactsTool = defineTool({
  name: 'list_contacts',
  description: 'Lista os contatos salvos (nome e final do número). Com query, só os que combinam com o nome.',
  schema: z.object({ query: z.string().min(1).max(80).optional() }),
  execute: async (params, ctx) => {
    const contacts = await listContacts(ctx.accountId);
    const wanted = params.query ? normalizeContactName(params.query) : null;
    const filtered = wanted ? contacts.filter((contact) => contact.name_normalized.includes(wanted)) : contacts;
    return { contacts: filtered.map((contact) => ({ name: contact.name, number_hint: maskWhatsappNumber(contact.whatsapp_number) })) };
  },
});

export const deleteContactTool = defineTool({
  name: 'delete_contact',
  description: 'Remove um contato salvo, pelo nome. Se o nome combinar com mais de um, devolve as opções (pergunte qual).',
  schema: z.object({ name: z.string().min(1).max(80) }),
  execute: async (params, ctx) => {
    const match = matchContactByName(params.name, await listContacts(ctx.accountId));
    if (match.kind === 'none') return { deleted: false, reason: 'contact_not_found' };
    if (match.kind === 'ambiguous') return { deleted: false, reason: 'ambiguous', candidates: match.contacts.map((contact) => contact.name) };
    await deleteContact(ctx.accountId, match.contact.id);
    return { deleted: true, contact_name: match.contact.name };
  },
});

export const draftMessageForContactTool = defineTool({
  name: 'draft_message_for_contact',
  description:
    'Redige um recado pra OUTRA pessoa e devolve link wa.me com o texto: ELA envia, você NUNCA envia a terceiros. message na voz dela, só com o que pediu (nada inventado). Mostre o texto e o link. contact_saved:false = sem número (ofereça save_contact); ambiguous = pergunte qual contato.',
  schema: z.object({
    contact_name: z.string().min(1).max(80).optional(),
    message: z.string().min(1).max(1000),
  }),
  execute: async (params, ctx) => {
    const message = params.message.trim();
    let contact = null;
    let recipientName: string | null = params.contact_name?.trim() ?? null;

    if (params.contact_name) {
      const match = matchContactByName(params.contact_name, await listContacts(ctx.accountId));
      if (match.kind === 'ambiguous') return { status: 'ambiguous', candidates: match.contacts.map((candidate) => candidate.name) };
      if (match.kind === 'one') {
        contact = match.contact;
        recipientName = match.contact.name;
      }
    }

    await createMessageDraft({ accountId: ctx.accountId, userId: ctx.userId, contactId: contact?.id ?? null, recipientName, body: message });
    return {
      status: 'ready',
      to: recipientName,
      contact_saved: contact !== null,
      message,
      link: buildWhatsappComposeLink(contact?.whatsapp_number ?? null, message),
    };
  },
});

export const updateMessageStatusTool = defineTool({
  name: 'update_message_status',
  description:
    'Registra o que ELA contou de um recado: sent, replied (reply_summary) ou discarded. Atualiza o mais recente (do contato citado). Só registre o que ela disse.',
  schema: z.object({
    contact_name: z.string().min(1).max(80).optional(),
    status: z.enum(['sent', 'replied', 'discarded']),
    reply_summary: z.string().max(500).optional(),
  }),
  execute: async (params, ctx) => {
    const wanted = params.contact_name ? normalizeContactName(params.contact_name) : null;
    const draft = (await listMessageDrafts(ctx.accountId, 20)).find(
      (candidate) => !wanted || normalizeContactName(candidate.recipient_name ?? '').includes(wanted),
    );
    if (!draft) return { updated: false, reason: 'no_message_found' };

    await updateMessageDraft(ctx.accountId, draft.id, { status: params.status, replyNote: params.reply_summary });
    return { updated: true, to: draft.recipient_name, status: params.status };
  },
});

export const listMessageLogTool = defineTool({
  name: 'list_message_log',
  description:
    'Log dos recados redigidos e do que ela contou de cada um (o status vem dela; você não sabe se foi enviado ou respondido).',
  schema: z.object({ contact_name: z.string().min(1).max(80).optional() }),
  execute: async (params, ctx) => {
    const wanted = params.contact_name ? normalizeContactName(params.contact_name) : null;
    const drafts = (await listMessageDrafts(ctx.accountId, 20))
      .filter((draft) => !wanted || normalizeContactName(draft.recipient_name ?? '').includes(wanted))
      .slice(0, 8);

    return {
      messages: drafts.map((draft) => ({
        to: draft.recipient_name,
        message: draft.body.slice(0, 200),
        status: draft.status,
        reply_summary: draft.reply_note,
        created_at: draft.created_at,
      })),
    };
  },
});
