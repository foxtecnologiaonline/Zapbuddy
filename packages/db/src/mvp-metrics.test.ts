import { describe, expect, it } from 'vitest';
import { ACTION_TOOL_NAMES, DAY_MS, computeFirstAction, computeMvpMetrics, computeRetention, dayIndexOf, percentile, type MvpMetricsInput } from './mvp-metrics.js';

const T0 = Date.parse('2026-11-01T12:00:00.000Z');
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();
const NOW_LATE = new Date(T0 + 30 * DAY_MS);

function input(partial: Partial<MvpMetricsInput> & Pick<MvpMetricsInput, 'users'>): MvpMetricsInput {
  return { messageTimesByNumber: new Map(), firstActionAtByUser: new Map(), now: NOW_LATE, ...partial };
}

const user = (id: string, createdOffsetMs = 0) => ({ id, whatsappNumber: `55${id}`, createdAt: at(createdOffsetMs) });

describe('dayIndexOf', () => {
  it('conta janelas de 24h desde o cadastro, não dias do calendário', () => {
    expect(dayIndexOf(T0, T0)).toBe(0);
    expect(dayIndexOf(T0, T0 + DAY_MS - 1)).toBe(0);
    expect(dayIndexOf(T0, T0 + DAY_MS)).toBe(1);
    expect(dayIndexOf(T0, T0 + 6 * DAY_MS + 1000)).toBe(6);
  });

  it('fora da semana 1 não conta', () => {
    expect(dayIndexOf(T0, T0 + 7 * DAY_MS)).toBeNull();
    expect(dayIndexOf(T0, T0 + 30 * DAY_MS)).toBeNull();
  });

  it('tolera 1 min de relógio antes do cadastro (o evento é gravado logo depois de criar o usuário), mas não mais que isso', () => {
    expect(dayIndexOf(T0, T0 - 30_000)).toBe(0);
    expect(dayIndexOf(T0, T0 - 61_000)).toBeNull();
  });
});

describe('percentile', () => {
  it('interpola e trata lista vazia e unitária', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([7], 0.9)).toBe(7);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 0.9)).toBeCloseTo(46);
  });
});

describe('computeRetention', () => {
  it('sem ninguém: tudo nulo, sem dividir por zero', () => {
    const result = computeRetention(input({ users: [] }));
    expect(result.matureCount).toBe(0);
    expect(result.avgActiveDays).toBeNull();
    expect(result.pctReturned).toBeNull();
    expect(result.pctEveryDay).toBeNull();
    expect(result.pctActiveByDay.every((value) => value === null)).toBe(true);
  });

  it('quem ainda está na semana 1 fica fora da conta (não puxa o número pra baixo)', () => {
    const fresh = { id: 'new', whatsappNumber: '55new', createdAt: new Date(NOW_LATE.getTime() - 2 * DAY_MS).toISOString() };
    const result = computeRetention(input({ users: [user('a'), fresh] }));
    expect(result.matureCount).toBe(1);
    expect(result.inProgressCount).toBe(1);
  });

  it('exatamente 7 dias completos já conta como madura', () => {
    const edge = { id: 'edge', whatsappNumber: '55edge', createdAt: new Date(NOW_LATE.getTime() - 7 * DAY_MS).toISOString() };
    expect(computeRetention(input({ users: [edge] })).matureCount).toBe(1);
  });

  it('calcula dias ativos distintos, retorno e uso em todos os 7 dias', () => {
    const everyDay = Array.from({ length: 7 }, (_, d) => at(d * DAY_MS + 1000));
    const result = computeRetention(
      input({
        users: [user('1'), user('2'), user('3'), user('4')],
        messageTimesByNumber: new Map([
          ['551', everyDay], // 7 dias
          ['552', [at(1000), at(2000), at(3000)]], // 3 mensagens, mas todas no dia 0 → 1 dia ativo
          ['553', [at(1000), at(DAY_MS + 5000)]], // dias 0 e 1 → voltou
          // 554: nenhuma mensagem registrada → 0 dias
        ]),
      }),
    );

    expect(result.matureCount).toBe(4);
    expect(result.activeDaysHistogram).toEqual([1, 1, 1, 0, 0, 0, 0, 1]);
    expect(result.avgActiveDays).toBeCloseTo((7 + 1 + 2 + 0) / 4);
    expect(result.pctReturned).toBe(50); // 553 e 551
    expect(result.pctEveryDay).toBe(25);
    expect(result.pctActiveByDay[0]).toBe(75); // 1, 2, 3
    expect(result.pctActiveByDay[1]).toBe(50); // 1, 3
    expect(result.pctActiveByDay[6]).toBe(25);
  });

  it('muitas mensagens no mesmo dia contam como um dia só, e mensagem depois da semana 1 não conta', () => {
    const result = computeRetention(
      input({
        users: [user('1')],
        messageTimesByNumber: new Map([['551', [at(1), at(2), at(3), at(10 * DAY_MS)]]]),
      }),
    );
    expect(result.activeDaysHistogram[1]).toBe(1);
    expect(result.avgActiveDays).toBe(1);
  });
});

describe('computeFirstAction', () => {
  it('mediana, p90 e quem chegou a uma ação', () => {
    const users = [user('1'), user('2'), user('3'), user('4')];
    const result = computeFirstAction(
      input({
        users,
        firstActionAtByUser: new Map([
          ['1', at(2 * 60_000)], // 2 min
          ['2', at(8 * 60_000)], // 8 min
          ['3', at(5 * 60 * 60_000)], // 5 h
          // 4: nunca fez uma ação
        ]),
      }),
    );

    expect(result.totalUsers).toBe(4);
    expect(result.reachedCount).toBe(3);
    expect(result.pctReached).toBe(75);
    expect(result.medianMinutes).toBe(8);
    expect(result.pctWithin10Min).toBe(50); // 2 de 4
    expect(result.pctWithin24h).toBe(75); // 3 de 4
  });

  it('quem acabou de entrar não entra no denominador de "em 10 min" nem de "em 24h"', () => {
    const justNow = new Date(T0 + 30 * DAY_MS - 60_000).toISOString(); // há 1 min
    const hoursAgo = new Date(T0 + 30 * DAY_MS - 3 * 60 * 60_000).toISOString(); // há 3 h
    const result = computeFirstAction(
      input({
        users: [
          { id: 'old', whatsappNumber: '55old', createdAt: at(0) },
          { id: 'h3', whatsappNumber: '55h3', createdAt: hoursAgo },
          { id: 'now', whatsappNumber: '55now', createdAt: justNow },
        ],
        firstActionAtByUser: new Map([['old', at(60_000)]]),
      }),
    );

    // "em 10 min": old e h3 já tiveram tempo (2 pessoas), só old chegou → 50%. "now" não conta.
    expect(result.pctWithin10Min).toBe(50);
    // "em 24h": só old tem 24h de cadastro (1 pessoa) e chegou → 100%.
    expect(result.pctWithin24h).toBe(100);
    // Mas o total geral continua contando todo mundo.
    expect(result.totalUsers).toBe(3);
    expect(result.pctReached).toBeCloseTo(33.33, 1);
  });

  it('ação com horário anterior ao cadastro (relógio) vira 0 min, nunca negativo', () => {
    const result = computeFirstAction(input({ users: [user('1')], firstActionAtByUser: new Map([['1', at(-5000)]]) }));
    expect(result.medianMinutes).toBe(0);
  });

  it('sem usuários: nulos, sem dividir por zero', () => {
    const result = computeFirstAction(input({ users: [] }));
    expect(result.pctReached).toBeNull();
    expect(result.medianMinutes).toBeNull();
    expect(result.pctWithin10Min).toBeNull();
  });
});

describe('computeMvpMetrics e definição de ação', () => {
  it('junta as duas métricas', () => {
    const result = computeMvpMetrics(input({ users: [user('1')] }));
    expect(result.retention.matureCount).toBe(1);
    expect(result.firstAction.totalUsers).toBe(1);
  });

  it('só tool que cria registro conta como ação; configuração, memória e onboarding ficam de fora', () => {
    for (const name of ['create_task', 'record_transaction', 'create_reminder', 'create_note']) expect(ACTION_TOOL_NAMES).toContain(name);
    for (const name of ['complete_onboarding', 'set_preferred_name', 'set_city', 'remember_fact', 'set_quiet_hours', 'list_tasks', 'manage_list']) {
      expect(ACTION_TOOL_NAMES).not.toContain(name);
    }
  });
});
