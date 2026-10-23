import { describe, expect, it } from 'vitest';
import { computeHabitStats, localDateKey, shiftDateKey } from './streak.js';

describe('shiftDateKey', () => {
  it('atravessa virada de mês e de ano', () => {
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('localDateKey', () => {
  it('usa a data do fuso da pessoa, não a UTC', () => {
    // 2026-05-10 01:00 UTC = 2026-05-09 22:00 em São Paulo
    expect(localDateKey('America/Sao_Paulo', new Date('2026-05-10T01:00:00Z'))).toBe('2026-05-09');
  });
});

describe('computeHabitStats', () => {
  const today = '2026-10-23';

  it('sem check-in nenhum: tudo zerado', () => {
    expect(computeHabitStats([], today)).toEqual({ doneToday: false, currentStreak: 0, last7Days: 0 });
  });

  it('conta dias seguidos incluindo hoje', () => {
    const stats = computeHabitStats(['2026-10-23', '2026-10-22', '2026-10-21'], today);
    expect(stats).toEqual({ doneToday: true, currentStreak: 3, last7Days: 3 });
  });

  it('hoje ainda sem marcar não quebra a sequência que vinha até ontem', () => {
    const stats = computeHabitStats(['2026-10-22', '2026-10-21'], today);
    expect(stats).toEqual({ doneToday: false, currentStreak: 2, last7Days: 2 });
  });

  it('um dia perdido zera a sequência, mas a contagem de 7 dias continua', () => {
    const stats = computeHabitStats(['2026-10-21', '2026-10-20', '2026-10-19'], today);
    expect(stats.currentStreak).toBe(0);
    expect(stats.last7Days).toBe(3);
  });

  it('para no primeiro buraco', () => {
    const stats = computeHabitStats(['2026-10-23', '2026-10-22', '2026-10-20', '2026-10-19'], today);
    expect(stats.currentStreak).toBe(2);
  });

  it('check-in fora da janela de 7 dias não entra na contagem semanal', () => {
    expect(computeHabitStats(['2026-10-10'], today).last7Days).toBe(0);
  });
});
