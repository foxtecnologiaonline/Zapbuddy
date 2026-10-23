import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zapbuddy/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zapbuddy/db')>();
  return {
    ...actual,
    findFreshKnowledgeEntryByQuery: vi.fn(),
    findSimilarKnowledgeEntries: vi.fn().mockResolvedValue([]),
    insertKnowledgeEntry: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock('../embeddings/client.js', () => ({
  embedText: vi.fn().mockResolvedValue(null),
}));

import { findFreshKnowledgeEntryByQuery, findSimilarKnowledgeEntries, insertKnowledgeEntry } from '@zapbuddy/db';
import { embedText } from '../embeddings/client.js';
import { searchWeb } from './client.js';

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.WEB_SEARCH_API_KEY = 'test-key';
  vi.mocked(findFreshKnowledgeEntryByQuery).mockReset();
  vi.mocked(findSimilarKnowledgeEntries).mockReset().mockResolvedValue([]);
  vi.mocked(insertKnowledgeEntry).mockReset();
  vi.mocked(embedText).mockReset().mockResolvedValue(null);
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('searchWeb', () => {
  it('reaproveita entrada de cache fresca sem chamar a API externa', async () => {
    vi.mocked(findFreshKnowledgeEntryByQuery).mockResolvedValue({
      id: 'k1',
      origin: 'user_query',
      query: 'o que é MEI',
      normalized_query: 'o que é mei',
      summary: 'resumo em cache',
      source_urls: ['https://example.com'],
      embedding: null,
      user_id: null,
      created_at: new Date().toISOString(),
    });
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await searchWeb('O que é MEI?', { origin: 'user_query' });

    expect(result.fromCache).toBe(true);
    expect(result.summary).toBe('resumo em cache');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(insertKnowledgeEntry).not.toHaveBeenCalled();
  });

  it('busca na API e grava uma entrada nova quando não há cache', async () => {
    vi.mocked(findFreshKnowledgeEntryByQuery).mockResolvedValue(null);
    vi.mocked(insertKnowledgeEntry).mockResolvedValue({} as never);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ title: 'MEI', url: 'https://gov.br/mei', content: 'é um regime...' }] }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await searchWeb('o que é MEI', { origin: 'user_query' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.fromCache).toBe(false);
    expect(result.sourceUrls).toEqual(['https://gov.br/mei']);
    expect(insertKnowledgeEntry).toHaveBeenCalledTimes(1);
  });

  it('reaproveita entrada semanticamente similar (cache por embedding) sem chamar a API externa', async () => {
    vi.mocked(findFreshKnowledgeEntryByQuery).mockResolvedValue(null);
    vi.mocked(embedText).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(findSimilarKnowledgeEntries).mockResolvedValue([
      {
        id: 'k2',
        origin: 'user_query',
        query: 'o que é o MEI',
        summary: 'resumo semanticamente similar',
        source_urls: ['https://gov.br/mei'],
        created_at: new Date().toISOString(),
        similarity: 0.95,
      },
    ]);
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await searchWeb('me explica o que é MEI', { origin: 'user_query' });

    expect(result.fromCache).toBe(true);
    expect(result.summary).toBe('resumo semanticamente similar');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(insertKnowledgeEntry).not.toHaveBeenCalled();
  });

  it('ignora entrada similar abaixo do limiar de similaridade e busca na API', async () => {
    vi.mocked(findFreshKnowledgeEntryByQuery).mockResolvedValue(null);
    vi.mocked(insertKnowledgeEntry).mockResolvedValue({} as never);
    vi.mocked(embedText).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(findSimilarKnowledgeEntries).mockResolvedValue([
      {
        id: 'k3',
        origin: 'user_query',
        query: 'taxa do simples nacional',
        summary: 'resumo de assunto só parecido',
        source_urls: [],
        created_at: new Date().toISOString(),
        similarity: 0.5,
      },
    ]);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ title: 'MEI', url: 'https://gov.br/mei', content: 'é um regime...' }] }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await searchWeb('o que é MEI', { origin: 'user_query' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.fromCache).toBe(false);
  });

  it('falha de forma controlada quando WEB_SEARCH_API_KEY não está configurada', async () => {
    delete process.env.WEB_SEARCH_API_KEY;
    vi.mocked(findFreshKnowledgeEntryByQuery).mockResolvedValue(null);

    await expect(searchWeb('qualquer coisa', { origin: 'user_query' })).rejects.toThrow(
      'WEB_SEARCH_API_KEY não configurada',
    );
  });
});

describe('searchWeb com freshness current', () => {
  it('usa o índice de notícias, cache curto e inclui a data de publicação no resumo', async () => {
    vi.mocked(findFreshKnowledgeEntryByQuery).mockResolvedValue(null);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ title: 'Final hoje', url: 'https://x.com/1', content: 'Time A 2 x 1 Time B', published_date: '2026-10-23' }] }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await searchWeb('resultado da final', { origin: 'user_query', freshness: 'current' });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
    expect(body.topic).toBe('news');
    expect(body.days).toBe(3);
    expect(vi.mocked(findFreshKnowledgeEntryByQuery).mock.calls[0]![1]).toBe(20 * 60 * 1000);
    expect(result.summary).toContain('[2026-10-23] Final hoje');
  });

  it('busca geral continua sem topic de notícia e com cache de 7 dias', async () => {
    vi.mocked(findFreshKnowledgeEntryByQuery).mockResolvedValue(null);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    global.fetch = fetchSpy as unknown as typeof fetch;

    await searchWeb('o que é mei', { origin: 'user_query' });

    expect(JSON.parse(fetchSpy.mock.calls[0]![1].body as string)).not.toHaveProperty('topic');
    expect(vi.mocked(findFreshKnowledgeEntryByQuery).mock.calls[0]![1]).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
