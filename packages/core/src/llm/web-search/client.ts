import { findFreshKnowledgeEntryByQuery, insertKnowledgeEntry } from '@zapbuddy/db';
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
 * de categorizar um gasto. Cache-first por normalized_query em
 * knowledge_entries (packages/db) — evita repetir a mesma busca externa; só
 * bate na API de verdade em cache miss. Ver CLAUDE.md, amendamento "Pesquisa
 * autônoma e aprendizado contínuo".
 */
export async function searchWeb(query: string, options: SearchWebOptions): Promise<SearchWebResult> {
  const normalizedQuery = normalizeQuery(query);
  const maxCacheAgeMs = options.maxCacheAgeMs ?? DEFAULT_MAX_CACHE_AGE_MS;

  const cached = await findFreshKnowledgeEntryByQuery(normalizedQuery, maxCacheAgeMs);
  if (cached) {
    return { fromCache: true, summary: cached.summary, sourceUrls: cached.source_urls };
  }

  const results = await fetchFromTavily(query, options.maxResults ?? DEFAULT_MAX_RESULTS);
  const summary = summarize(results) || 'Nenhum resultado encontrado.';
  const sourceUrls = results.map((result) => result.url).filter(Boolean);

  const embedding = await embedText(summary);
  await insertKnowledgeEntry({
    origin: options.origin,
    query,
    normalizedQuery,
    summary,
    sourceUrls,
    embedding,
    userId: options.userId ?? null,
  });

  return { fromCache: false, summary, sourceUrls };
}
