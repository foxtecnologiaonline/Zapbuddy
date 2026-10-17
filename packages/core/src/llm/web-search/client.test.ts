import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zapbuddy/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zapbuddy/db')>();
  return {
    ...actual,
    findFreshKnowledgeEntryByQuery: vi.fn(),
    insertKnowledgeEntry: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock('../embeddings/client.js', () => ({
  embedText: vi.fn().mockResolvedValue(null),
}));

import { findFreshKnowledgeEntryByQuery, insertKnowledgeEntry } from '@zapbuddy/db';
import { searchWeb } from './client.js';

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.WEB_SEARCH_API_KEY = 'test-key';
  vi.mocked(findFreshKnowledgeEntryByQuery).mockReset();
  vi.mocked(insertKnowledgeEntry).mockReset();
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

  it('falha de forma controlada quando WEB_SEARCH_API_KEY não está configurada', async () => {
    delete process.env.WEB_SEARCH_API_KEY;
    vi.mocked(findFreshKnowledgeEntryByQuery).mockResolvedValue(null);

    await expect(searchWeb('qualquer coisa', { origin: 'user_query' })).rejects.toThrow(
      'WEB_SEARCH_API_KEY não configurada',
    );
  });
});
