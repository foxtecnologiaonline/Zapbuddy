import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: Array<{ table: string; inValues: string[][]; from: number; to: number }> = [];

/** Cliente Supabase mínimo: encadeia filtros (ignorados, a tabela já vem filtrada) e entrega a faixa pedida em `.range()`. */
function fakeClient() {
  return {
    from(table: string) {
      const inValues: string[][] = [];
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'gte', 'eq', 'order']) builder[method] = () => builder;
      builder.in = (_column: string, values: string[]) => {
        inValues.push(values);
        return builder;
      };
      builder.range = (from: number, to: number) => {
        calls.push({ table, inValues, from, to });
        return Promise.resolve({ data: (tables[table] ?? []).slice(from, to + 1), error: null });
      };
      return builder;
    },
  };
}

vi.mock('../client.js', () => ({ getSupabaseClient: () => fakeClient() }));

import { getMvpMetricsReport } from './mvp-metrics.js';

const NOW = new Date('2026-12-01T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  calls.length = 0;
});

describe('getMvpMetricsReport', () => {
  it('sem cadastros na janela: relatório vazio, sem consultar eventos nem ações', async () => {
    tables.users = [];
    const report = await getMvpMetricsReport(30, NOW);

    expect(report.metrics.retention.matureCount).toBe(0);
    expect(report.metrics.firstAction.totalUsers).toBe(0);
    expect(report.truncated).toBe(false);
    expect(calls.map((call) => call.table)).toEqual(['users']);
  });

  it('cruza usuários, mensagens (por número) e a primeira ação (por usuário)', async () => {
    const created = NOW.getTime() - 20 * DAY;
    tables.users = [{ id: 'u1', whatsapp_number: '5511', created_at: iso(created) }];
    tables.webhook_events = [
      { whatsapp_number: '5511', created_at: iso(created + 1000) },
      { whatsapp_number: '5511', created_at: iso(created + DAY + 1000) },
      { whatsapp_number: null, created_at: iso(created + 5000) }, // sem número: ignorado
    ];
    tables.tool_call_logs = [
      { user_id: 'u1', created_at: iso(created + 5 * 60_000) },
      { user_id: 'u1', created_at: iso(created + 2 * 60_000) }, // a mais antiga vale, mesmo fora de ordem
      { user_id: null, created_at: iso(created) }, // usuário apagado: ignorado
    ];

    const { metrics } = await getMvpMetricsReport(30, NOW);

    expect(metrics.retention.matureCount).toBe(1);
    expect(metrics.retention.activeDaysHistogram[2]).toBe(1); // dia 0 e dia 1
    expect(metrics.firstAction.reachedCount).toBe(1);
    expect(metrics.firstAction.medianMinutes).toBe(2);
  });

  it('pagina além de 1000 linhas e não perde nenhuma mensagem', async () => {
    const created = NOW.getTime() - 20 * DAY;
    tables.users = [{ id: 'u1', whatsapp_number: '5511', created_at: iso(created) }];
    // 1500 mensagens, todas no dia 3 → 1 dia ativo, mas precisa ler as duas páginas sem erro.
    tables.webhook_events = Array.from({ length: 1500 }, (_, i) => ({ whatsapp_number: '5511', created_at: iso(created + 3 * DAY + i) }));

    const { metrics, truncated } = await getMvpMetricsReport(30, NOW);

    expect(truncated).toBe(false);
    expect(metrics.retention.activeDaysHistogram[1]).toBe(1);
    const eventCalls = calls.filter((call) => call.table === 'webhook_events');
    expect(eventCalls.map((call) => [call.from, call.to])).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('avisa quando bate no teto de linhas (número aproximado)', async () => {
    const created = NOW.getTime() - 20 * DAY;
    tables.users = [{ id: 'u1', whatsapp_number: '5511', created_at: iso(created) }];
    tables.webhook_events = Array.from({ length: 20_500 }, (_, i) => ({ whatsapp_number: '5511', created_at: iso(created + i) }));

    expect((await getMvpMetricsReport(30, NOW)).truncated).toBe(true);
  });

  it('divide os números em lotes de 100 pra não estourar a URL do .in()', async () => {
    tables.users = Array.from({ length: 250 }, (_, i) => ({ id: `u${i}`, whatsapp_number: `55${i}`, created_at: iso(NOW.getTime() - 20 * DAY) }));

    await getMvpMetricsReport(30, NOW);

    const eventChunks = calls.filter((call) => call.table === 'webhook_events').map((call) => call.inValues[0]!.length);
    expect(eventChunks).toEqual([100, 100, 50]);
  });
});
