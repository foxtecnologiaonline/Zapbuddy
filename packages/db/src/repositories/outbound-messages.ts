import { getSupabaseClient } from '../client.js';
import type { OutboundMessage, OutboundReply, OutboundSendMode } from '../types.js';

export interface CreatePendingOutboundInput {
  accountId: string;
  userId: string;
  contactId: string | null;
  recipientName: string;
  recipientNumber: string;
  body: string;
  turnId: string;
  expiresAtIso: string;
}

/**
 * Só existe UM recado aguardando confirmação por pessoa: preparar outro
 * (ex.: "não, manda 'boa tarde'") cancela o anterior. É isso que permite
 * `send_prepared_message` não receber id — o histórico curto da conversa é só
 * texto, o Tom não teria como lembrar o id do turno anterior.
 */
export async function createPendingOutbound(input: CreatePendingOutboundInput): Promise<OutboundMessage> {
  const client = getSupabaseClient();

  const { error: cancelError } = await client
    .from('outbound_messages')
    .update({ status: 'cancelled' })
    .eq('user_id', input.userId)
    .eq('status', 'pending_confirmation');
  if (cancelError) throw cancelError;

  const { data, error } = await client
    .from('outbound_messages')
    .insert({
      account_id: input.accountId,
      user_id: input.userId,
      contact_id: input.contactId,
      recipient_name: input.recipientName,
      recipient_number: input.recipientNumber,
      body: input.body,
      created_turn_id: input.turnId,
      expires_at: input.expiresAtIso,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as OutboundMessage;
}

export async function findLatestPendingOutbound(userId: string): Promise<OutboundMessage | null> {
  const { data, error } = await getSupabaseClient()
    .from('outbound_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending_confirmation')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as OutboundMessage | null) ?? null;
}

/**
 * Reivindica o recado pra envio de forma atômica (pending → sent): duas
 * chamadas simultâneas ou um retry nunca mandam a mensagem duas vezes — quem
 * perde a corrida recebe null. Se o envio falhar depois, markOutboundFailed.
 */
export async function claimPendingOutbound(messageId: string): Promise<OutboundMessage | null> {
  const { data, error } = await getSupabaseClient()
    .from('outbound_messages')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('status', 'pending_confirmation')
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as OutboundMessage | null) ?? null;
}

export async function markOutboundDispatched(messageId: string, input: { waMessageId: string | null; sendMode: OutboundSendMode }): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('outbound_messages')
    .update({ wa_message_id: input.waMessageId, send_mode: input.sendMode })
    .eq('id', messageId);
  if (error) throw error;
}

export async function markOutboundFailed(messageId: string, reason: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('outbound_messages')
    .update({ status: 'failed', failed_reason: reason.slice(0, 300) })
    .eq('id', messageId);
  if (error) throw error;
}

/** Quantos recados a pessoa já mandou desde `sinceIso` — teto diário contra spam e contra queda de qualidade do número na Meta. */
export async function countOutboundSentSince(userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from('outbound_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('sent_at', 'is', null)
    .gte('sent_at', sinceIso);
  if (error) throw error;
  return count ?? 0;
}

export interface OutboundMessageWithReplies extends OutboundMessage {
  replies: OutboundReply[];
}

/** Log dos recados da conta, mais recentes primeiro, já com as respostas (2 queries, sem N+1). Pendentes de confirmação não entram: ainda não foram enviados. */
export async function listOutboundMessages(accountId: string, limit = 30): Promise<OutboundMessageWithReplies[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('outbound_messages')
    .select('*')
    .eq('account_id', accountId)
    .neq('status', 'pending_confirmation')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const messages = (data ?? []) as OutboundMessage[];
  if (messages.length === 0) return [];

  const { data: replyRows, error: replyError } = await client
    .from('outbound_replies')
    .select('*')
    .in(
      'outbound_message_id',
      messages.map((message) => message.id),
    )
    .order('created_at', { ascending: true });
  if (replyError) throw replyError;

  const repliesByMessage = new Map<string, OutboundReply[]>();
  for (const reply of (replyRows ?? []) as OutboundReply[]) {
    repliesByMessage.set(reply.outbound_message_id, [...(repliesByMessage.get(reply.outbound_message_id) ?? []), reply]);
  }
  return messages.map((message) => ({ ...message, replies: repliesByMessage.get(message.id) ?? [] }));
}

/** Último recado enviado a esse número (em qualquer variante do 9º dígito) na janela — é a que uma resposta dele se refere. */
export async function findRecentOutboundToNumbers(numberVariants: string[], sinceIso: string): Promise<OutboundMessage | null> {
  const { data, error } = await getSupabaseClient()
    .from('outbound_messages')
    .select('*')
    .in('recipient_number', numberVariants)
    .in('status', ['sent', 'delivered', 'read'])
    .gte('sent_at', sinceIso)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as OutboundMessage | null) ?? null;
}

/** Idempotente por wa_message_id (a Meta reentrega webhook): null quando essa resposta já estava registrada. */
export async function insertOutboundReply(input: {
  outboundMessageId: string;
  accountId: string;
  waMessageId: string;
  messageType: string;
  body: string | null;
}): Promise<OutboundReply | null> {
  const { data, error } = await getSupabaseClient()
    .from('outbound_replies')
    .upsert(
      {
        outbound_message_id: input.outboundMessageId,
        account_id: input.accountId,
        wa_message_id: input.waMessageId,
        message_type: input.messageType,
        body: input.body,
      },
      { onConflict: 'wa_message_id', ignoreDuplicates: true },
    )
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as OutboundReply | null) ?? null;
}

export type DeliveryStatusUpdate =
  | { status: 'delivered'; atIso: string }
  | { status: 'read'; atIso: string }
  | { status: 'failed'; reason: string };

/**
 * Aplica o status que a Meta devolve pelo webhook (sent → delivered → read, ou
 * failed). Só avança: status fora de ordem (read chegando antes de delivered,
 * ou delivered reentregue depois de read) nunca regride o estado.
 */
export async function applyDeliveryStatus(waMessageId: string, update: DeliveryStatusUpdate): Promise<void> {
  const table = () => getSupabaseClient().from('outbound_messages');

  if (update.status === 'delivered') {
    const { error } = await table().update({ status: 'delivered', delivered_at: update.atIso }).eq('wa_message_id', waMessageId).eq('status', 'sent');
    if (error) throw error;
  } else if (update.status === 'read') {
    const { error } = await table()
      .update({ status: 'read', read_at: update.atIso })
      .eq('wa_message_id', waMessageId)
      .in('status', ['sent', 'delivered']);
    if (error) throw error;
  } else {
    const { error } = await table()
      .update({ status: 'failed', failed_reason: update.reason.slice(0, 300) })
      .eq('wa_message_id', waMessageId)
      .in('status', ['sent', 'delivered']);
    if (error) throw error;
  }
}
