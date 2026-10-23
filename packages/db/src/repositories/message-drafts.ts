import { getSupabaseClient } from '../client.js';
import type { MessageDraft } from '../types.js';

export async function createMessageDraft(input: {
  accountId: string;
  userId: string;
  contactId: string | null;
  recipientName: string | null;
  body: string;
}): Promise<MessageDraft> {
  const { data, error } = await getSupabaseClient()
    .from('message_drafts')
    .insert({
      account_id: input.accountId,
      user_id: input.userId,
      contact_id: input.contactId,
      recipient_name: input.recipientName,
      body: input.body,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as MessageDraft;
}

/** Recados da conta, mais recentes primeiro (descartados não entram) — base do log do painel e do list_message_log. */
export async function listMessageDrafts(accountId: string, limit = 30): Promise<MessageDraft[]> {
  const { data, error } = await getSupabaseClient()
    .from('message_drafts')
    .select('*')
    .eq('account_id', accountId)
    .neq('status', 'discarded')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as MessageDraft[];
}

export interface MessageDraftUpdate {
  status: 'sent' | 'replied' | 'discarded';
  replyNote?: string;
}

/** Atualiza um recado da conta com o que a pessoa contou. Null se o id não existe nessa conta. */
export async function updateMessageDraft(accountId: string, draftId: string, update: MessageDraftUpdate): Promise<MessageDraft | null> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: update.status };
  if (update.status === 'sent') patch.sent_confirmed_at = now;
  if (update.status === 'replied') {
    patch.replied_at = now;
    patch.reply_note = update.replyNote ?? null;
  }

  const { data, error } = await getSupabaseClient()
    .from('message_drafts')
    .update(patch)
    .eq('id', draftId)
    .eq('account_id', accountId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as MessageDraft | null) ?? null;
}
