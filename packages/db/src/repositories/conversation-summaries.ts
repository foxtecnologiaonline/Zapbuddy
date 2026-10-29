import { getSupabaseClient } from '../client.js';

export interface ConversationSummary {
  summary: string;
  updatedAt: string;
}

export async function getConversationSummary(userId: string): Promise<ConversationSummary | null> {
  const { data, error } = await getSupabaseClient().from('conversation_summaries').select('summary, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { summary: string; updated_at: string };
  return { summary: row.summary, updatedAt: row.updated_at };
}

export async function saveConversationSummary(userId: string, summary: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('conversation_summaries')
    .upsert({ user_id: userId, summary, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}
