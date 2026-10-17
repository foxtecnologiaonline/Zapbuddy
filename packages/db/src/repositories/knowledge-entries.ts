import { getSupabaseClient } from '../client.js';
import { logger } from '../logger.js';
import type { KnowledgeEntry, KnowledgeEntryOrigin, SimilarKnowledgeEntry } from '../types.js';

export interface InsertKnowledgeEntryInput {
  origin: KnowledgeEntryOrigin;
  query: string;
  normalizedQuery: string;
  summary: string;
  sourceUrls: string[];
  /** Null quando a chamada de embedding falhou — a entrada ainda serve de cache exato. */
  embedding: number[] | null;
  userId?: string | null;
}

export async function insertKnowledgeEntry(input: InsertKnowledgeEntryInput): Promise<KnowledgeEntry> {
  const { data, error } = await getSupabaseClient()
    .from('knowledge_entries')
    .insert({
      origin: input.origin,
      query: input.query,
      normalized_query: input.normalizedQuery,
      summary: input.summary,
      source_urls: input.sourceUrls,
      embedding: input.embedding,
      user_id: input.userId ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as KnowledgeEntry;
}

/**
 * Cache exato por normalized_query — evita bater na API de busca externa de
 * novo pra uma pergunta repetida (ex.: o mesmo estabelecimento desconhecido
 * aparecendo em transações de usuários diferentes). `maxAgeMs` controla
 * quão "fresca" a entrada precisa ser; cada chamador decide o que é razoável
 * (pesquisa proativa semanal vs. busca pontual do usuário).
 */
export async function findFreshKnowledgeEntryByQuery(
  normalizedQuery: string,
  maxAgeMs: number,
): Promise<KnowledgeEntry | null> {
  const sinceIso = new Date(Date.now() - maxAgeMs).toISOString();
  const { data, error } = await getSupabaseClient()
    .from('knowledge_entries')
    .select('*')
    .eq('normalized_query', normalizedQuery)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as KnowledgeEntry) ?? null;
}

/**
 * Recuperação por similaridade (RAG) via função SQL `match_knowledge_entries`
 * (migration 0005) — não dá pra expressar o operador `<=>` do pgvector no
 * query builder do supabase-js, por isso usa `.rpc()`. Retorna lista vazia
 * em vez de lançar erro se a função ainda não existir/falhar — é um bônus de
 * contexto pro LLM, não deve derrubar a conversa se o RPC der problema.
 */
export async function findSimilarKnowledgeEntries(
  embedding: number[],
  limit: number,
): Promise<SimilarKnowledgeEntry[]> {
  const { data, error } = await getSupabaseClient().rpc('match_knowledge_entries', {
    query_embedding: embedding,
    match_count: limit,
  });

  if (error) {
    logger.error('knowledge_entries_similarity_search_failed', { error });
    return [];
  }
  return (data ?? []) as SimilarKnowledgeEntry[];
}
