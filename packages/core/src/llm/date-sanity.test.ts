import { describe, expect, it } from 'vitest';
import { assertFutureDate, assertReasonableOccurredAt, assertPlausibleTimestamp } from './date-sanity.js';

describe('assertFutureDate', () => {
  it('aceita uma data no futuro próximo', () => {
    const iso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(() => assertFutureDate(iso, 'remind_at')).not.toThrow();
  });

  it('tolera até 2 minutos no passado (clock skew)', () => {
    const iso = new Date(Date.now() - 60 * 1000).toISOString();
    expect(() => assertFutureDate(iso, 'remind_at')).not.toThrow();
  });

  it('rejeita data claramente no passado', () => {
    const iso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(() => assertFutureDate(iso, 'remind_at')).toThrow(/remind_at/);
  });

  it('rejeita data mais de 2 anos no futuro', () => {
    const iso = new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(() => assertFutureDate(iso, 'remind_at')).toThrow();
  });

  it('rejeita string que não é uma data válida', () => {
    expect(() => assertFutureDate('não-é-data', 'remind_at')).toThrow(/não é uma data válida/);
  });
});

describe('assertReasonableOccurredAt', () => {
  it('aceita agora e um passado recente', () => {
    expect(() => assertReasonableOccurredAt(new Date().toISOString(), 'occurred_at')).not.toThrow();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(() => assertReasonableOccurredAt(yesterday, 'occurred_at')).not.toThrow();
  });

  it('rejeita mais de 3 anos no passado', () => {
    const iso = new Date(Date.now() - 4 * 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(() => assertReasonableOccurredAt(iso, 'occurred_at')).toThrow();
  });

  it('rejeita data no futuro além da folga de 1 dia', () => {
    const iso = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(() => assertReasonableOccurredAt(iso, 'occurred_at')).toThrow();
  });
});

describe('assertPlausibleTimestamp', () => {
  it('aceita data no passado (prazo de tarefa já vencido é cenário legítimo)', () => {
    const iso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(() => assertPlausibleTimestamp(iso, 'due_at')).not.toThrow();
  });

  it('rejeita data absurdamente longe (erro grosseiro de interpretação)', () => {
    const iso = new Date(Date.now() + 20 * 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(() => assertPlausibleTimestamp(iso, 'due_at')).toThrow();
  });
});
