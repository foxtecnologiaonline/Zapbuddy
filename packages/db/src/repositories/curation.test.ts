import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const upserts: Array<{ table: string; payload: Row; options: unknown }> = [];
let reviewsTableMissing = false;
let upsertFails: { code?: string; message?: string } | null = null;

/** Cliente Supabase mínimo com filtros reais (eq/gte/lte/in), thenable, maybeSingle e upsert. */
function fakeClient() {
  return {
    from(table: string) {
      const predicates: Array<(row: Row) => boolean> = [];
      let limitValue = Infinity;
      const run = () => {
        if (table === 'curation_reviews' && reviewsTableMissing) {
          return { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.curation_reviews' in the schema cache" } };
        }
        const rows = (tables[table] ?? []).filter((row) => predicates.every((predicate) => predicate(row)));
        return { data: rows.slice(0, limitValue), error: null };
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        limit: (value: number) => {
          limitValue = value;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          predicates.push((row) => row[column] === value);
          return builder;
        },
        gte: (column: string, value: string) => {
          predicates.push((row) => String(row[column]) >= value);
          return builder;
        },
        lte: (column: string, value: string) => {
          predicates.push((row) => String(row[column]) <= value);
          return builder;
        },
        in: (column: string, values: unknown[]) => {
          predicates.push((row) => values.includes(row[column]));
          return builder;
        },
        maybeSingle: () => Promise.resolve({ data: run().data?.[0] ?? null, error: null }),
        upsert: (payload: Row, options: unknown) => {
          upserts.push({ table, payload, options });
          return Promise.resolve({ error: upsertFails });
        },
        then: (resolve: (value: unknown) => unknown) => resolve(run()),
      };
      return builder;
    },
  };
}

vi.mock('../client.js', () => ({ getSupabaseClient: () => fakeClient() }));

import { CurationCaseNotFoundError, CurationInvalidReviewError, CurationTableMissingError, getCurationQueue, listCurationReviews, saveCurationReview } from './curation.js';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const iso = (secondsAgo: number) => new Date(NOW.getTime() - secondsAgo * 1000).toISOString();

function logRow(id: string, partial: Row): Row {
  return { id, user_id: 'u1', tool_name: 'create_task', parameters: {}, result: { ok: true }, success: true, error: null, duration_ms: 5, created_at: iso(60), ...partial };
}

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  upserts.length = 0;
  reviewsTableMissing = false;
  upsertFails = null;
});

describe('getCurationQueue', () => {
  it('detecta os casos e junta os vereditos já dados', async () => {
    tables.tool_call_logs = [logRow('a', { tool_name: 'create_reminder', success: false, error: 'sem data' }), logRow('b', { tool_name: 'list_tasks' })];
    tables.curation_reviews = [{ tool_call_log_id: 'a', signal: 'failed', verdict: 'errou', destination: 'prompt', note: null, snapshot: {}, reviewed_at: iso(10) }];

    const queue = await getCurationQueue(14, NOW);

    expect(queue.scan.cases.map((item) => item.logId)).toEqual(['a']);
    expect(queue.scan.callsTotal).toBe(2);
    expect(queue.reviewsAvailable).toBe(true);
    expect(queue.reviews.get('a')).toMatchObject({ verdict: 'errou', destination: 'prompt' });
  });

  it('migration 0030 pendente: a fila aparece e a página sabe que não dá pra salvar veredito', async () => {
    tables.tool_call_logs = [logRow('a', { success: false, error: 'x' })];
    reviewsTableMissing = true;

    const queue = await getCurationQueue(14, NOW);

    expect(queue.scan.cases).toHaveLength(1);
    expect(queue.reviewsAvailable).toBe(false);
    expect(queue.reviews.size).toBe(0);
  });

  it('sem nenhum caso também descobre se a tabela existe', async () => {
    tables.tool_call_logs = [logRow('a', {})];
    reviewsTableMissing = true;
    expect((await getCurationQueue(14, NOW)).reviewsAvailable).toBe(false);
  });
});

describe('saveCurationReview', () => {
  it('recusa veredito inválido antes de tocar no banco', async () => {
    await expect(saveCurationReview({ logId: 'a', verdict: 'errou', destination: null, note: null })).rejects.toBeInstanceOf(CurationInvalidReviewError);
    expect(upserts).toHaveLength(0);
  });

  it('log inexistente (ex.: já apagado pela retenção) vira "caso não encontrado"', async () => {
    tables.tool_call_logs = [];
    await expect(saveCurationReview({ logId: 'zzz', verdict: 'acertou', destination: null, note: null })).rejects.toBeInstanceOf(CurationCaseNotFoundError);
  });

  it('log sem nenhum sinal não vira caso (não dá pra revisar o que não é sinal)', async () => {
    tables.tool_call_logs = [logRow('a', { tool_name: 'list_tasks' })];
    await expect(saveCurationReview({ logId: 'a', verdict: 'acertou', destination: null, note: null })).rejects.toBeInstanceOf(CurationCaseNotFoundError);
  });

  it('reconstrói o caso no servidor e grava o veredito com o trecho mascarado', async () => {
    tables.tool_call_logs = [
      logRow('a', { tool_name: 'record_transaction', parameters: { category: 'pet', description: 'ração cpf 123.456.789-09' }, result: { category_fallback: true } }),
    ];

    const saved = await saveCurationReview({ logId: 'a', verdict: 'errou', destination: 'categoria', note: '  falta a categoria pet; ligar 34 99199-1020  ' });

    expect(saved.signal).toBe('category_fallback');
    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.options).toEqual({ onConflict: 'tool_call_log_id' });
    const payload = upserts[0]!.payload as Record<string, unknown> & { snapshot: { parameters: string; summary: string } };
    expect(payload).toMatchObject({ tool_call_log_id: 'a', signal: 'category_fallback', verdict: 'errou', destination: 'categoria' });
    expect(payload.note).toBe('falta a categoria pet; ligar [telefone]');
    expect(payload.snapshot.parameters).toContain('[cpf]');
    expect(payload.snapshot.parameters).not.toContain('123.456.789-09');
  });

  it('acha o sinal "corrigido logo depois" olhando a criação anterior do mesmo usuário', async () => {
    tables.tool_call_logs = [
      logRow('create', { tool_name: 'create_task', created_at: iso(120) }),
      logRow('edit', { tool_name: 'update_task', created_at: iso(60) }),
      logRow('other-user', { tool_name: 'create_task', user_id: 'u2', created_at: iso(70) }),
    ];

    const saved = await saveCurationReview({ logId: 'edit', verdict: 'errou', destination: 'prompt', note: null });

    expect(saved.signal).toBe('corrected');
    expect(saved.summary).toContain('60s depois de create_task');
  });

  it('veredito que não é "errou" grava sem destino', async () => {
    tables.tool_call_logs = [logRow('a', { success: false, error: 'x' })];
    await saveCurationReview({ logId: 'a', verdict: 'ruido', destination: null, note: null });
    expect(upserts[0]!.payload).toMatchObject({ verdict: 'ruido', destination: null, note: null });
  });

  it('migration pendente na hora de gravar vira erro claro', async () => {
    tables.tool_call_logs = [logRow('a', { success: false, error: 'x' })];
    upsertFails = { code: '42P01', message: 'relation "curation_reviews" does not exist' };
    await expect(saveCurationReview({ logId: 'a', verdict: 'acertou', destination: null, note: null })).rejects.toBeInstanceOf(CurationTableMissingError);
  });
});

describe('listCurationReviews', () => {
  it('devolve os vereditos e, com a migration pendente, um erro claro', async () => {
    tables.curation_reviews = [{ tool_call_log_id: 'a', signal: 'failed', verdict: 'acertou', destination: null, note: null, snapshot: {}, reviewed_at: iso(5) }];
    expect(await listCurationReviews()).toHaveLength(1);

    reviewsTableMissing = true;
    await expect(listCurationReviews()).rejects.toBeInstanceOf(CurationTableMissingError);
  });
});
