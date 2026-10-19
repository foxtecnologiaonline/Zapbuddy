import { getSupabaseClient } from '../client.js';
import type { Note } from '../types.js';

export async function createNote(accountId: string, userId: string, content: string): Promise<Note> {
  const { data, error } = await getSupabaseClient()
    .from('notes')
    .insert({ account_id: accountId, created_by_user_id: userId, content })
    .select('*')
    .single();

  if (error) throw error;
  return data as Note;
}

const DEFAULT_NOTES_LIMIT = 50;

export async function listNotes(accountId: string, limit: number = DEFAULT_NOTES_LIMIT): Promise<Note[]> {
  const { data, error } = await getSupabaseClient()
    .from('notes')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Note[];
}

/** Remove de verdade — mesmo raciocínio de deleteTask, nota apagada não tem valor histórico pra manter. */
export async function deleteNote(accountId: string, noteId: string): Promise<Note | null> {
  const { data, error } = await getSupabaseClient()
    .from('notes')
    .delete()
    .eq('id', noteId)
    .eq('account_id', accountId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as Note | null) ?? null;
}
