import { describe, expect, it } from 'vitest';
import { computeNextOccurrence } from './recurrence.js';

describe('computeNextOccurrence', () => {
  it('soma 1 dia pra recorrência diária', () => {
    const next = computeNextOccurrence('2026-03-10T09:00:00.000Z', 'daily');
    expect(next).toBe('2026-03-11T09:00:00.000Z');
  });

  it('soma 7 dias pra recorrência semanal', () => {
    const next = computeNextOccurrence('2026-03-10T09:00:00.000Z', 'weekly');
    expect(next).toBe('2026-03-17T09:00:00.000Z');
  });

  it('soma 1 mês de calendário pra recorrência mensal', () => {
    const next = computeNextOccurrence('2026-03-05T09:00:00.000Z', 'monthly');
    expect(next).toBe('2026-04-05T09:00:00.000Z');
  });

  it('atravessa virada de ano corretamente', () => {
    const next = computeNextOccurrence('2026-12-20T09:00:00.000Z', 'daily');
    expect(next).toBe('2026-12-21T09:00:00.000Z');
    const nextMonth = computeNextOccurrence('2026-12-05T09:00:00.000Z', 'monthly');
    expect(nextMonth).toBe('2027-01-05T09:00:00.000Z');
  });
});
