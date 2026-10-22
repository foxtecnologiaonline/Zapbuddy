import { describe, expect, it } from 'vitest';
import { toGraphDateTime, fromGraphDateTime } from './microsoft-datetime.js';

describe('toGraphDateTime', () => {
  it('converte um horário com offset negativo (ex.: horário de Brasília) pra UTC sem o sufixo Z', () => {
    expect(toGraphDateTime('2026-10-20T15:00:00-03:00')).toEqual({
      dateTime: '2026-10-20T18:00:00.000',
      timeZone: 'UTC',
    });
  });

  it('converte um horário já em UTC mantendo o mesmo instante', () => {
    expect(toGraphDateTime('2026-10-20T18:00:00Z')).toEqual({
      dateTime: '2026-10-20T18:00:00.000',
      timeZone: 'UTC',
    });
  });

  it('converte um offset positivo (ex.: Fernando de Noronha não, mas um fuso qualquer a leste de UTC)', () => {
    expect(toGraphDateTime('2026-10-20T10:00:00+05:00')).toEqual({
      dateTime: '2026-10-20T05:00:00.000',
      timeZone: 'UTC',
    });
  });

  it('lança erro pra uma data inválida, em vez de devolver um dateTime quebrado silenciosamente', () => {
    expect(() => toGraphDateTime('não é uma data')).toThrow('Data inválida');
  });
});

describe('fromGraphDateTime', () => {
  it('adiciona Z quando o Graph devolve o horário UTC sem sufixo (comportamento default da API)', () => {
    expect(fromGraphDateTime('2026-10-20T18:00:00.0000000')).toBe('2026-10-20T18:00:00.0000000Z');
  });

  it('não mexe num valor que já tem Z', () => {
    expect(fromGraphDateTime('2026-10-20T18:00:00Z')).toBe('2026-10-20T18:00:00Z');
  });

  it('não mexe num valor que já tem offset explícito', () => {
    expect(fromGraphDateTime('2026-10-20T15:00:00-03:00')).toBe('2026-10-20T15:00:00-03:00');
  });
});
