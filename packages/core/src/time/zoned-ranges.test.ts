import { describe, expect, it } from 'vitest';
import { getCurrentMonthRange, getLast7DaysRange, getTodayRange } from './zoned-ranges.js';

describe('getTodayRange', () => {
  it('calcula o dia certo quando já é o dia seguinte em UTC (America/Sao_Paulo, UTC-3)', () => {
    // 2026-05-10 01:00 UTC = 2026-05-09 22:00 em São Paulo — ainda dia 9 lá.
    const reference = new Date('2026-05-10T01:00:00.000Z');
    const { startIso, endIso } = getTodayRange('America/Sao_Paulo', reference);

    expect(startIso).toBe('2026-05-09T03:00:00.000Z');
    expect(endIso).toBe('2026-05-10T02:59:59.000Z');
  });
});

describe('getLast7DaysRange', () => {
  it('cobre hoje + 6 dias anteriores no fuso do usuário, não calendário UTC', () => {
    const reference = new Date('2026-05-10T01:00:00.000Z'); // 2026-05-09 22:00 em São Paulo
    const { startIso, endIso } = getLast7DaysRange('America/Sao_Paulo', reference);

    // 6 dias antes de 09/05 = 03/05, início do dia em São Paulo.
    expect(startIso).toBe('2026-05-03T03:00:00.000Z');
    expect(endIso).toBe('2026-05-10T02:59:59.000Z');
  });

  it('atravessa virada de mês corretamente (dia - 6 cai no mês anterior)', () => {
    const reference = new Date('2026-06-02T12:00:00.000Z'); // 2026-06-02 09:00 em São Paulo
    const { startIso } = getLast7DaysRange('America/Sao_Paulo', reference);

    // 6 dias antes de 02/06 = 27/05.
    expect(startIso).toBe('2026-05-27T03:00:00.000Z');
  });
});

describe('getCurrentMonthRange', () => {
  it('calcula o mês certo quando ainda é o dia anterior em UTC (America/Sao_Paulo, UTC-3)', () => {
    const reference = new Date('2026-03-01T01:00:00.000Z');
    const { startIso, endIso } = getCurrentMonthRange('America/Sao_Paulo', reference);

    expect(startIso).toBe('2026-02-01T03:00:00.000Z');
    expect(endIso).toBe('2026-03-01T02:59:59.000Z');
  });
});
