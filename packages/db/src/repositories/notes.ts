import { getSupabaseClient } from '../client.js';
import { logger } from '../logger.js';
import type { Note } from '../types.js';

/**
 * Colunas explícitas (nunca '*'): a tabela tem `embedding vector(1536)`, e um
 * select('*') mandaria ~1.500 números por nota pro dashboard, pro export e —
 * pior — pro contexto do LLM via list_notes.
 */
const NOTE_COLUMNS = 'id, account_id, content, created_by_user_id, created_at';

/** `embedding` null/ausente = nota sem vetor ainda; a busca por texto continua achando, e o backfill do worker completa depois. */
export async function createNote(accountId: string, userId: string, content: string, embedding?: number[] | null): Promise<Note> {
  const { data, error } = await getSupabaseClient()
    .from('notes')
    .insert({ account_id: accountId, created_by_user_id: userId, content, embedding: embedding ?? null })
    .select(NOTE_COLUMNS)
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
  let dbQuery = getSupabaseClient().from('notes').select(NOTE_COLUMNS).eq('account_id', accountId);
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
    .select(NOTE_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return (data as Note | null) ?? null;
}

/** Reescreve o texto de uma nota da conta. Null se o id não existe nessa conta. */
export async function updateNote(accountId: string, noteId: string, content: string, embedding: number[] | null = null): Promise<Note | null> {
  // O vetor sempre acompanha o texto: se não deu pra gerar o novo, grava null
  // em vez de deixar o vetor do texto antigo apontando pro assunto errado.
  const { data, error } = await getSupabaseClient()
    .from('notes')
    .update({ content, embedding })
    .eq('id', noteId)
    .eq('account_id', accountId)
    .select(NOTE_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return (data as Note | null) ?? null;
}

export interface RelatedNote extends Pick<Note, 'id' | 'content' | 'created_at'> {
  similarity: number;
}

/** Notas parecidas em significado com a busca (RPC match_notes, migration 0024). Vazio — nunca erro — se o RPC falhar: é bônus sobre a busca por texto. */
export async function searchNotesBySimilarity(
  accountId: string,
  embedding: number[],
  limit: number,
  minSimilarity: number,
): Promise<RelatedNote[]> {
  const { data, error } = await getSupabaseClient().rpc('match_notes', {
    p_account_id: accountId,
    query_embedding: embedding,
    match_count: limit,
    min_similarity: minSimilarity,
  });

  if (error) {
    logger.error('notes_similarity_search_failed', { error });
    return [];
  }
  return ((data ?? []) as Array<{ id: string; content: string; created_at: string; similarity: number }>).map((row) => ({
    id: row.id,
    content: row.content,
    created_at: row.created_at,
    similarity: row.similarity,
  }));
}

/** Notas ainda sem vetor, de qualquer conta — só pro backfill do worker. */
export async function listNotesMissingEmbedding(limit: number): Promise<Array<{ id: string; content: string }>> {
  const { data, error } = await getSupabaseClient().from('notes').select('id, content').is('embedding', null).limit(limit);
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; content: string }>;
}

export async function setNoteEmbedding(noteId: string, embedding: number[]): Promise<void> {
  const { error } = await getSupabaseClient().from('notes').update({ embedding }).eq('id', noteId);
  if (error) throw error;
}
