import { describe, expect, it } from 'vitest';
import { computeStreakDays } from './compute.js';

const TZ = 'America/Sao_Paulo';

describe('computeStreakDays', () => {
  it('conta 0 quando não há nenhuma transação', () => {
    expect(computeStreakDays([], TZ, new Date('2026-05-10T15:00:00.000Z'))).toBe(0);
  });

  it('conta 1 quando só hoje tem transação', () => {
    const now = new Date('2026-05-10T15:00:00.000Z'); // 12h em São Paulo
    expect(computeStreakDays(['2026-05-10T12:00:00.000Z'], TZ, now)).toBe(1);
  });

  it('conta dias consecutivos terminando hoje', () => {
    const now = new Date('2026-05-10T15:00:00.000Z');
    const isos = ['2026-05-10T12:00:00.000Z', '2026-05-09T12:00:00.000Z', '2026-05-08T12:00:00.000Z'];
    expect(computeStreakDays(isos, TZ, now)).toBe(3);
  });

  it('não quebra o streak se hoje ainda não tem registro (conta até ontem)', () => {
    const now = new Date('2026-05-10T10:00:00.000Z'); // manhã, ainda sem msg hoje
    const isos = ['2026-05-09T12:00:00.000Z', '2026-05-08T12:00:00.000Z'];
    expect(computeStreakDays(isos, TZ, now)).toBe(2);
  });

  it('para no primeiro buraco (dia sem transação)', () => {
    const now = new Date('2026-05-10T15:00:00.000Z');
    const isos = ['2026-05-10T12:00:00.000Z', '2026-05-08T12:00:00.000Z']; // falta dia 09
    expect(computeStreakDays(isos, TZ, now)).toBe(1);
  });

  it('múltiplas transações no mesmo dia local contam como 1 dia só', () => {
    const now = new Date('2026-05-10T15:00:00.000Z');
    const isos = ['2026-05-10T12:00:00.000Z', '2026-05-10T18:00:00.000Z', '2026-05-09T12:00:00.000Z'];
    expect(computeStreakDays(isos, TZ, now)).toBe(2);
  });
});
