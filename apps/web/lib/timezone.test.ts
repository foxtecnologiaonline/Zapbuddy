import { describe, expect, it } from 'vitest';
import { getCurrentMonthRange } from './timezone.js';

describe('getCurrentMonthRange', () => {
  it('calcula o mês certo quando ainda é o dia anterior em UTC (America/Sao_Paulo, UTC-3)', () => {
    // 2026-03-01 01:00 UTC = 2026-02-28 22:00 em São Paulo — ainda fevereiro lá.
    const reference = new Date('2026-03-01T01:00:00.000Z');
    const { startIso, endIso } = getCurrentMonthRange('America/Sao_Paulo', reference);

    // Início de fevereiro em São Paulo (UTC-3) = 2026-02-01T03:00:00Z em UTC.
    expect(startIso).toBe('2026-02-01T03:00:00.000Z');
    // Fim de fevereiro (28, ano não-bissexto) 23:59:59 em São Paulo = 2026-03-01T02:59:59Z.
    expect(endIso).toBe('2026-03-01T02:59:59.000Z');
  });

  it('calcula o mês certo quando já virou o dia seguinte em UTC vs. o fuso local', () => {
    // 2026-06-30 23:30 UTC = 2026-07-01 02:30 em Lisboa (UTC+1 no horário de verão... Europe/Lisbon varia) —
    // usamos um fuso de offset positivo fixo e simples pra não depender de DST: usamos America/Sao_Paulo
    // de novo com outra borda, que hoje não tem DST (abolido em 2019).
    const reference = new Date('2026-07-01T02:30:00.000Z'); // 2026-06-30 23:30 em São Paulo
    const { startIso, endIso } = getCurrentMonthRange('America/Sao_Paulo', reference);

    expect(startIso).toBe('2026-06-01T03:00:00.000Z');
    expect(endIso).toBe('2026-07-01T02:59:59.000Z');
  });

  it('respeita fuso diferente (UTC) pra comparação — mesmo instante, mês diferente do caso São Paulo', () => {
    const reference = new Date('2026-03-01T01:00:00.000Z');
    const { startIso, endIso } = getCurrentMonthRange('UTC', reference);

    // Em UTC, 2026-03-01T01:00Z já é março — mês diferente do calculado pra São Paulo no 1º teste.
    expect(startIso).toBe('2026-03-01T00:00:00.000Z');
    expect(endIso).toBe('2026-03-31T23:59:59.000Z');
  });
});
