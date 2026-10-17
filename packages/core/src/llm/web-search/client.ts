import { findFreshKnowledgeEntryByQuery, findSimilarKnowledgeEntries, insertKnowledgeEntry } from '@zapbuddy/db';
import type { KnowledgeEntryOrigin } from '@zapbuddy/db';
import { embedText } from '../embeddings/client.js';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchWebOptions {
  origin: KnowledgeEntryOrigin;
  userId?: string | null;
  maxResults?: number;
  /** Quão "fresco" um resultado em cache precisa ser pra ser reaproveitado sem buscar de novo. */
  maxCacheAgeMs?: number;
}

export interface SearchWebResult {
  summary: string;
  sourceUrls: string[];
  fromCache: boolean;
}

const DEFAULT_MAX_RESULTS = 5;
// 7 dias: cobre bem o cadenciamento semanal da pesquisa proativa e buscas
// repetidas de categorização (mesmo estabelecimento aparecendo de novo em
// pouco tempo) sem deixar o conteúdo velho demais pra dúvida geral do
// usuário, que tende a querer algo mais atual.
const DEFAULT_MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Cosine similarity (1 - distância) a partir da qual duas perguntas contam
// como "a mesma pergunta" pro cache semântico — alto de propósito: é melhor
// buscar de novo (custo baixo) do que devolver resposta de uma pergunta só
// parecida como se fosse a mesma (CLAUDE.md: nunca inventar/confundir fato).
const SEMANTIC_CACHE_SIMILARITY_THRESHOLD = 0.88;

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

interface TavilyResponse {
  results?: { title?: string; url?: string; content?: string }[];
}

async function fetchFromTavily(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const apiKey = process.env.WEB_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error('WEB_SEARCH_API_KEY não configurada — busca na web indisponível');
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: 'basic',
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily respondeu ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as TavilyResponse;
  return (body.results ?? []).map((result) => ({
    title: result.title ?? '',
    url: result.url ?? '',
    snippet: result.content ?? '',
  }));
}

function summarize(results: WebSearchResult[]): string {
  return results.map((result) => `- ${result.title}: ${result.snippet}`).join('\n');
}

/**
 * Busca compartilhada por: tool `web_search` (conversa com usuário, via
 * runToolCall — logada), job proactive-research (background) e a própria
 * tool quando usada pra identificar um estabelecimento desconhecido antes
 * de categorizar um gasto. Duas camadas de cache em knowledge_entries
 * (packages/db) antes de bater na API externa: (1) exato, por
 * normalized_query; (2) semântico, por similaridade de embedding — pega o
 * caso comum de pergunta reformulada ("o que é mei" vs. "me explica o que é
 * MEI") que o cache exato não pegaria. Isso é a base de conhecimento (RAG)
 * crescendo com o uso, não só um cache de string. Ver CLAUDE.md, amendamento
 * "Pesquisa autônoma e aprendizado contínuo".
 */
export async function searchWeb(query: string, options: SearchWebOptions): Promise<SearchWebResult> {
  const normalizedQuery = normalizeQuery(query);
  const maxCacheAgeMs = options.maxCacheAgeMs ?? DEFAULT_MAX_CACHE_AGE_MS;

  const exactMatch = await findFreshKnowledgeEntryByQuery(normalizedQuery, maxCacheAgeMs);
  if (exactMatch) {
    return { fromCache: true, summary: exactMatch.summary, sourceUrls: exactMatch.source_urls };
  }

  // Embedding da QUERY (não do resultado): é o que permite comparar com a
  // query de uma busca futura via match_knowledge_entries. Calculado antes
  // da busca externa pra servir tanto o cache semântico abaixo quanto, em
  // caso de miss, a entrada nova gravada no fim — uma única chamada de
  // embedding por busca, não duas.
  const queryEmbedding = await embedText(query);
  if (queryEmbedding) {
    const similarEntries = await findSimilarKnowledgeEntries(queryEmbedding, 1);
    const semanticMatch = similarEntries.find(
      (entry) =>
        entry.similarity >= SEMANTIC_CACHE_SIMILARITY_THRESHOLD &&
        Date.now() - new Date(entry.created_at).getTime() <= maxCacheAgeMs,
    );
    if (semanticMatch) {
      return { fromCache: true, summary: semanticMatch.summary, sourceUrls: semanticMatch.source_urls };
    }
  }

  const results = await fetchFromTavily(query, options.maxResults ?? DEFAULT_MAX_RESULTS);
  const summary = summarize(results) || 'Nenhum resultado encontrado.';
  const sourceUrls = results.map((result) => result.url).filter(Boolean);

  await insertKnowledgeEntry({
    origin: options.origin,
    query,
    normalizedQuery,
    summary,
    sourceUrls,
    embedding: queryEmbedding,
    userId: options.userId ?? null,
  });

  return { fromCache: false, summary, sourceUrls };
}
