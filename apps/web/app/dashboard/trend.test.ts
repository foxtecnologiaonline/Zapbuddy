import { describe, expect, it } from 'vitest';
import { bucketSumsByDay, TREND_WINDOW_DAYS } from './trend.js';

describe('bucketSumsByDay', () => {
  it('soma amount_cents por dia, zero nos dias sem transação', () => {
    const now = new Date();
    const todayIso = now.toISOString();
    const yesterdayIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const result = bucketSumsByDay(
      [
        { occurred_at: todayIso, amount_cents: 1000 },
        { occurred_at: todayIso, amount_cents: 500 },
        { occurred_at: yesterdayIso, amount_cents: 2000 },
      ],
      'America/Sao_Paulo',
      3,
    );

    expect(result).toHaveLength(3);
    expect(result[result.length - 1]).toBe(1500); // hoje
    expect(result[result.length - 2]).toBe(2000); // ontem
    expect(result[result.length - 3]).toBe(0); // anteontem, sem transação
  });

  it('ignora transação fora da janela de dias pedida', () => {
    const oldIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = bucketSumsByDay([{ occurred_at: oldIso, amount_cents: 999 }], 'America/Sao_Paulo', 7);

    expect(result.every((v) => v === 0)).toBe(true);
  });

  it('usa TREND_WINDOW_DAYS como tamanho default', () => {
    const result = bucketSumsByDay([], 'America/Sao_Paulo');
    expect(result).toHaveLength(TREND_WINDOW_DAYS);
  });
});
