import { describe, expect, it } from 'vitest';
import { describeMoment } from './moment-hint.js';

const TZ = 'America/Sao_Paulo';

describe('describeMoment', () => {
  it('detecta fim de mês (últimos 3 dias do mês), mesmo não sendo sexta/manhã/madrugada', () => {
    // 2026-05-30, sábado, 14h local — fim de mês tem prioridade sobre o resto.
    expect(describeMoment(TZ, new Date('2026-05-30T17:00:00.000Z'))).toBe('fim de mês');
  });

  it('detecta sexta-feira à tarde/noite', () => {
    // 2026-05-15, sexta, 18h local.
    expect(describeMoment(TZ, new Date('2026-05-15T21:00:00.000Z'))).toBe('sexta-feira, fim de semana de trabalho chegando');
  });

  it('detecta começo da manhã', () => {
    // 2026-05-12, terça, 7h local.
    expect(describeMoment(TZ, new Date('2026-05-12T10:00:00.000Z'))).toBe('começo da manhã');
  });

  it('detecta altas horas', () => {
    // 2026-05-12, terça, 4h local.
    expect(describeMoment(TZ, new Date('2026-05-12T07:00:00.000Z'))).toBe('altas horas');
  });

  it('retorna null fora de qualquer condição notável (meio da tarde, dia comum)', () => {
    // 2026-05-12, terça, 15h local.
    expect(describeMoment(TZ, new Date('2026-05-12T18:00:00.000Z'))).toBeNull();
  });
});
