import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: { message?: string } | null };

/** Cliente Supabase de mentira: registra as chamadas e devolve o que o teste programar. */
const script = vi.hoisted(() => ({
  result: { data: [], error: null } as { data?: unknown; error?: { message?: string } | null },
  calls: [] as Array<{ op: string; arg?: unknown }>,
}));
const log = vi.hoisted(() => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock('../client.js', () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      script.calls.push({ op: `from:${table}` });
      const builder: Record<string, unknown> = {};
      builder.select = (columns: string) => {
        script.calls.push({ op: 'select', arg: columns });
        return builder;
      };
      builder.or = (filter: string) => {
        script.calls.push({ op: 'or', arg: filter });
        return Promise.resolve(script.result as Result);
      };
      builder.update = (patch: unknown) => {
        script.calls.push({ op: 'update', arg: patch });
        return builder;
      };
      builder.eq = (column: string, value: unknown) => {
        script.calls.push({ op: 'eq', arg: [column, value] });
        return Promise.resolve(script.result as Result);
      };
      return builder;
    },
  }),
}));
vi.mock('../logger.js', () => log);

import { listProactiveOptOuts, resetProactiveOptOutWarning, saveProactiveOptOut } from './routine-prefs.js';

beforeEach(() => {
  vi.clearAllMocks();
  script.calls.length = 0;
  script.result = { data: [], error: null };
  resetProactiveOptOutWarning();
});

describe('listProactiveOptOuts', () => {
  it('traz só quem desligou (uma consulta, só com as colunas novas) e separa insight de resumo semanal', async () => {
    script.result = {
      data: [
        { id: 'u1', routine_insights: false, routine_weekly_digest: true },
        { id: 'u2', routine_insights: true, routine_weekly_digest: false },
        { id: 'u3', routine_insights: false, routine_weekly_digest: false },
      ],
      error: null,
    };

    const result = await listProactiveOptOuts();

    expect([...result.insightsOff].sort()).toEqual(['u1', 'u3']);
    expect([...result.weeklyDigestOff].sort()).toEqual(['u2', 'u3']);
    expect(script.calls.find((call) => call.op === 'select')?.arg).toBe('id, routine_insights, routine_weekly_digest');
    expect(script.calls.find((call) => call.op === 'or')?.arg).toBe('routine_insights.eq.false,routine_weekly_digest.eq.false');
  });

  it('migration 0031 NÃO aplicada (coluna inexistente): devolve "ninguém desligou" e NUNCA lança — o sweep do bom dia não pode cair por isso', async () => {
    script.result = { data: null, error: { message: 'column users.routine_insights does not exist' } };

    const result = await listProactiveOptOuts();

    expect(result.insightsOff.size).toBe(0);
    expect(result.weeklyDigestOff.size).toBe(0);
    expect(log.logger.warn).toHaveBeenCalledWith('proactive_opt_out_unavailable', expect.objectContaining({ hint: expect.stringContaining('0031') }));
  });

  it('avisa UMA vez por processo (a consulta roda toda hora; o log não pode virar ruído)', async () => {
    script.result = { data: null, error: { message: 'coluna ausente' } };
    await listProactiveOptOuts();
    await listProactiveOptOuts();
    await listProactiveOptOuts();
    expect(log.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('resposta sem linhas = ninguém desligou (o caso comum)', async () => {
    script.result = { data: null, error: null };
    expect((await listProactiveOptOuts()).insightsOff.size).toBe(0);
  });
});

describe('saveProactiveOptOut', () => {
  it('grava só o que veio, na pessoa certa', async () => {
    await saveProactiveOptOut('u1', { routine_insights: false });
    expect(script.calls.find((call) => call.op === 'update')?.arg).toEqual({ routine_insights: false });
    expect(script.calls.find((call) => call.op === 'eq')?.arg).toEqual(['id', 'u1']);
  });

  it('LANÇA se a coluna não existe (quem chama diz à pessoa que não conseguiu; nunca finge que desligou)', async () => {
    script.result = { data: null, error: { message: 'column "routine_insights" does not exist' } };
    await expect(saveProactiveOptOut('u1', { routine_insights: false })).rejects.toMatchObject({ message: expect.stringContaining('routine_insights') });
  });

  it('pedido vazio não toca o banco', async () => {
    await saveProactiveOptOut('u1', {});
    expect(script.calls).toEqual([]);
  });
});
