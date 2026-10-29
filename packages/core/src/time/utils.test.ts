import { describe, expect, it } from 'vitest';
import { findPlace } from './places.js';
import { daysUntilDate, nextNationalHoliday, timeInPlace } from './utils.js';

describe('findPlace', () => {
  it('acha por nome com e sem acento e prefixo', () => {
    expect(findPlace('Lisboa')?.timeZone).toBe('Europe/Lisbon');
    expect(findPlace('em Tóquio')?.timeZone).toBe('Asia/Tokyo');
    expect(findPlace('Nova York, EUA')?.timeZone).toBe('America/New_York');
    expect(findPlace('Porto Alegre')?.timeZone).toBe('America/Sao_Paulo');
    expect(findPlace('Manaus')?.timeZone).toBe('America/Manaus');
  });

  it('lugar desconhecido = null, nunca chute', () => {
    expect(findPlace('Atlântida')).toBeNull();
    expect(findPlace('')).toBeNull();
  });
});

describe('timeInPlace', () => {
  it('calcula hora e diferença em relação a quem perguntou', () => {
    const now = new Date('2026-10-29T15:00:00Z'); // 12:00 em São Paulo (-3)
    const result = timeInPlace('Tóquio', 'America/Sao_Paulo', now);
    expect(result).toMatchObject({ found: true, place: 'Tóquio', time: '00:00', hours_ahead_of_you: 12, day_relation: 'next_day' });
  });

  it('lugar atrás do fuso da pessoa', () => {
    const now = new Date('2026-10-29T15:00:00Z');
    const result = timeInPlace('Manaus', 'America/Sao_Paulo', now);
    expect(result).toMatchObject({ found: true, hours_ahead_of_you: -1, day_relation: 'same_day' });
  });

  it('desconhecido', () => {
    expect(timeInPlace('Atlântida', 'America/Sao_Paulo')).toEqual({ found: false });
  });
});

describe('daysUntilDate', () => {
  const now = new Date('2026-10-29T15:00:00Z');
  it('conta dias corridos no fuso da pessoa', () => {
    expect(daysUntilDate('2026-12-25', 'America/Sao_Paulo', now)).toBe(57);
    expect(daysUntilDate('2026-10-29', 'America/Sao_Paulo', now)).toBe(0);
    expect(daysUntilDate('2026-10-20', 'America/Sao_Paulo', now)).toBe(-9);
  });

  it('virada de dia respeita o fuso (02h UTC ainda é o dia anterior no Brasil)', () => {
    expect(daysUntilDate('2026-10-30', 'America/Sao_Paulo', new Date('2026-10-30T02:00:00Z'))).toBe(1);
  });

  it('data inválida = null', () => {
    expect(daysUntilDate('2026-02-31', 'America/Sao_Paulo', now)).toBeNull();
    expect(daysUntilDate('amanha', 'America/Sao_Paulo', now)).toBeNull();
  });
});

describe('nextNationalHoliday', () => {
  it('acha Finados a partir de 29/10/2026', () => {
    const holiday = nextNationalHoliday('America/Sao_Paulo', new Date('2026-10-29T15:00:00Z'));
    expect(holiday).toMatchObject({ name: 'Finados', date: '2026-11-02', days_from_today: 4, official: true });
  });

  it('hoje conta (days_from_today 0)', () => {
    expect(nextNationalHoliday('America/Sao_Paulo', new Date('2026-12-25T15:00:00Z'))).toMatchObject({ name: 'Natal', days_from_today: 0 });
  });
});
