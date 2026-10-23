import { z } from 'zod';
import {
  claimPendingOutbound,
  countOutboundSentSince,
  createPendingOutbound,
  deleteContact,
  findContactById,
  findLatestPendingOutbound,
  findUserById,
  isNumberOptedOut,
  listContacts,
  listOutboundMessages,
  markOutboundDispatched,
  markOutboundFailed,
  upsertContact,
} from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { matchContactByName, normalizeContactName } from '../../contacts/matching.js';
import { maskWhatsappNumber, normalizeBrazilianWhatsappNumber, whatsappNumberVariants } from '../../contacts/phone.js';
import {
  CONFIRMATION_TTL_MS,
  DEFAULT_OUTBOUND_DAILY_LIMIT,
  chooseSendMode,
  composeOutboundText,
  describeSendFailure,
  isOutsideWindowError,
  sanitizeTemplateParam,
  type SendMode,
} from '../../contacts/outbound.js';
import { sendWhatsappTemplate, sendWhatsappTextTracked } from '../../whatsapp/channel.js';

function dailyLimit(): number {
  const configured = Number(process.env.OUTBOUND_DAILY_LIMIT);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_OUTBOUND_DAILY_LIMIT;
}

/** Template aprovado pela Meta pra abrir conversa fora da janela de 24h (ver .env.example). Null = não configurado. */
function templateConfig(): { name: string; languageCode: string } | null {
  const name = process.env.WHATSAPP_CONTACT_TEMPLATE_NAME;
  return name ? { name, languageCode: process.env.WHATSAPP_CONTACT_TEMPLATE_LANG ?? 'pt_BR' } : null;
}

async function isOverDailyLimit(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  return (await countOutboundSentSince(userId, since)) >= dailyLimit();
}

export const saveContactTool = defineTool({
  name: 'save_contact',
  description:
    'Salva (ou corrige o nome de) um contato com o número de WhatsApp, pra poder mandar recados. Use quando a ' +
    'pessoa disser o número de alguém ("o da Aline é 11 99999-9999") ou encaminhar um cartão de contato ' +
    '("[Contato compartilhado]"). Só números do Brasil.',
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
    return {
      contacts: filtered.map((contact) => ({
        name: contact.name,
        number_hint: maskWhatsappNumber(contact.whatsapp_number),
        opted_out: contact.opted_out_at !== null,
      })),
    };
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

export const prepareMessageToContactTool = defineTool({
  name: 'prepare_message_to_contact',
  description:
    'PASSO 1 de mandar um recado a OUTRA pessoa ("manda um bom dia pra Aline"): acha o contato pelo nome e deixa o ' +
    'recado preparado — NADA é enviado ainda. Escreva message na voz da própria pessoa, só com o que ela pediu ' +
    '(sem inventar conteúdo, valor, promessa ou compromisso). Depois mostre a ela o texto e o destinatário e ' +
    'pergunte se pode enviar. Um destinatário por pedido. Sem contato (contact_not_found), peça o número e use ' +
    'save_contact.',
  schema: z.object({
    contact_name: z.string().min(1).max(80),
    message: z.string().min(1).max(1000),
  }),
  execute: async (params, ctx) => {
    const match = matchContactByName(params.contact_name, await listContacts(ctx.accountId));
    if (match.kind === 'none') return { status: 'contact_not_found' };
    if (match.kind === 'ambiguous') return { status: 'ambiguous', candidates: match.contacts.map((contact) => contact.name) };

    const { contact } = match;
    if (contact.opted_out_at) return { status: 'contact_opted_out', contact_name: contact.name };
    if (await isOverDailyLimit(ctx.userId)) return { status: 'daily_limit_reached', limit: dailyLimit() };

    await createPendingOutbound({
      accountId: ctx.accountId,
      userId: ctx.userId,
      contactId: contact.id,
      recipientName: contact.name,
      recipientNumber: contact.whatsapp_number,
      body: params.message.trim(),
      turnId: ctx.turnId,
      expiresAtIso: new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString(),
    });
    return {
      status: 'awaiting_confirmation',
      to: contact.name,
      number_hint: maskWhatsappNumber(contact.whatsapp_number),
      message: params.message.trim(),
      valid_for_minutes: CONFIRMATION_TTL_MS / 60_000,
    };
  },
});

async function dispatch(mode: SendMode, to: string, senderName: string, body: string): Promise<{ messageId: string | null }> {
  const template = templateConfig();
  if (mode === 'template' && template) {
    return sendWhatsappTemplate(to, {
      name: template.name,
      languageCode: template.languageCode,
      bodyParams: [sanitizeTemplateParam(senderName, 60), sanitizeTemplateParam(body)],
    });
  }
  return sendWhatsappTextTracked(to, composeOutboundText(senderName, body));
}

export const sendPreparedMessageTool = defineTool({
  name: 'send_prepared_message',
  description:
    'PASSO 2: envia o recado que prepare_message_to_contact deixou pendente — SÓ depois que a pessoa disser "sim" ' +
    'numa mensagem POSTERIOR à que mostrou o texto (no mesmo turno é recusado: needs_confirmation_from_person). ' +
    'Não recebe parâmetros (envia o único recado pendente). O Tom sempre se identifica como assistente de quem ' +
    'pediu. Se vier sent:false, explique o reason sem inventar. Se ela desistir ou mudar o texto, NÃO chame ' +
    'esta tool: prepare de novo.',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    const pending = await findLatestPendingOutbound(ctx.userId);
    if (!pending) return { sent: false, reason: 'nothing_pending' };
    if (pending.created_turn_id === ctx.turnId) return { sent: false, reason: 'needs_confirmation_from_person' };
    if (new Date(pending.expires_at).getTime() < Date.now()) return { sent: false, reason: 'confirmation_expired' };
    if (await isNumberOptedOut(whatsappNumberVariants(pending.recipient_number))) return { sent: false, reason: 'contact_opted_out' };
    if (await isOverDailyLimit(ctx.userId)) return { sent: false, reason: 'daily_limit_reached' };

    // Atômico: dois envios simultâneos ou um retry nunca duplicam a mensagem a um terceiro.
    const claimed = await claimPendingOutbound(pending.id);
    if (!claimed) return { sent: false, reason: 'already_handled' };

    const [sender, contact] = await Promise.all([
      findUserById(ctx.userId),
      pending.contact_id ? findContactById(ctx.accountId, pending.contact_id) : Promise.resolve(null),
    ]);
    const senderName = sender?.preferred_name ?? sender?.name ?? 'Um contato seu';
    const template = templateConfig();

    let mode = chooseSendMode({ lastInboundAtIso: contact?.last_inbound_at ?? null, templateConfigured: template !== null });
    try {
      let result: { messageId: string | null };
      try {
        result = await dispatch(mode, pending.recipient_number, senderName, pending.body);
      } catch (error) {
        // Janela de 24h fechada que não sabíamos: tenta uma vez pelo template, se houver.
        const message = error instanceof Error ? error.message : String(error);
        if (mode === 'free_form' && template && isOutsideWindowError(message)) {
          mode = 'template';
          result = await dispatch(mode, pending.recipient_number, senderName, pending.body);
        } else {
          throw error;
        }
      }
      await markOutboundDispatched(pending.id, { waMessageId: result.messageId, sendMode: mode });
      return { sent: true, to: pending.recipient_name, mode };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markOutboundFailed(pending.id, message);
      return { sent: false, reason: describeSendFailure(message) };
    }
  },
});

export const listSentMessagesTool = defineTool({
  name: 'list_sent_messages',
  description:
    'Os recados que o Tom já enviou a outras pessoas e o que aconteceu: enviado, entregue, lido, falhou, e se a ' +
    'pessoa respondeu (e o quê). Use pra "a Aline respondeu?", "o que eu mandei pro João?". Com contact_name, só ' +
    'os desse contato. Os dados vêm daqui — não presuma que leram ou responderam.',
  schema: z.object({ contact_name: z.string().min(1).max(80).optional() }),
  execute: async (params, ctx) => {
    const wanted = params.contact_name ? normalizeContactName(params.contact_name) : null;
    const messages = (await listOutboundMessages(ctx.accountId, 20))
      .filter((message) => !wanted || normalizeContactName(message.recipient_name).includes(wanted))
      .slice(0, 8);

    return {
      messages: messages.map((message) => ({
        to: message.recipient_name,
        message: message.body.slice(0, 200),
        status: message.status,
        sent_at: message.sent_at,
        read_at: message.read_at,
        failed_reason: message.failed_reason,
        replied: message.replies.length > 0,
        replies: message.replies.slice(0, 3).map((reply) => ({ type: reply.message_type, text: reply.body?.slice(0, 300) ?? null, at: reply.created_at })),
      })),
    };
  },
});
