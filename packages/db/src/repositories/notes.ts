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

/**
 * `query` é opcional (ILIKE simples, sem pgvector/embedding — nota é texto
 * curto, busca exata/substring já resolve "o que eu anotei sobre X") — usado
 * pela tool search_notes e pelo dashboard.
 */
/** Escapa curingas do ILIKE pra que a busca seja sempre texto literal. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listNotes(accountId: string, limit: number = DEFAULT_NOTES_LIMIT, query?: string): Promise<Note[]> {
  let dbQuery = getSupabaseClient().from('notes').select('*').eq('account_id', accountId);
  if (query) dbQuery = dbQuery.ilike('content', `%${escapeLike(query)}%`);

  const { data, error } = await dbQuery.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as Note[];
}

/** Contagem simples (sem buscar as linhas) — usada pelo resumo semanal pra mencionar "você anotou N notas essa semana" sem custo de trazer o conteúdo. */
export async function countNotesSince(accountId: string, sinceIso: string): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from('notes')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('created_at', sinceIso);

  if (error) throw error;
  return count ?? 0;
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
