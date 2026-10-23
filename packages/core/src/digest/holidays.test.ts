import { describe, expect, it } from 'vitest';
import { describeHolidayToday, describeNationalHolidayToday, describeStateHolidayToday } from './holidays.js';

describe('describeNationalHolidayToday', () => {
  it('feriado fixo', () => {
    expect(describeNationalHolidayToday(2026, 10, 12)).toEqual({
      name: 'Nossa Senhora Aparecida',
      official: true,
      scope: 'nacional',
    });
  });

  it('feriado móvel: Sexta-feira Santa 2026 (Páscoa em 5/4/2026)', () => {
    expect(describeNationalHolidayToday(2026, 4, 3)).toEqual({
      name: 'Sexta-feira Santa',
      official: true,
      scope: 'nacional',
    });
  });

  it('ponto facultativo móvel: Carnaval 2026', () => {
    expect(describeNationalHolidayToday(2026, 2, 17)).toEqual({
      name: 'Carnaval',
      official: false,
      scope: 'nacional',
    });
  });

  it('ponto facultativo móvel: Corpus Christi 2026', () => {
    expect(describeNationalHolidayToday(2026, 6, 4)).toEqual({
      name: 'Corpus Christi',
      official: false,
      scope: 'nacional',
    });
  });

  it('dia sem feriado nacional', () => {
    expect(describeNationalHolidayToday(2026, 10, 22)).toBeNull();
  });
});

describe('describeStateHolidayToday', () => {
  it('feriado estadual de data fixa (SP)', () => {
    expect(describeStateHolidayToday('SP', 2026, 7, 9)).toEqual({
      name: 'Revolução Constitucionalista',
      official: true,
      scope: 'estadual',
    });
  });

  it('feriado estadual móvel (ES, Nossa Senhora da Penha, 8 dias após a Páscoa)', () => {
    expect(describeStateHolidayToday('ES', 2026, 4, 13)).toEqual({
      name: 'Nossa Senhora da Penha',
      official: true,
      scope: 'estadual',
    });
  });

  it('UF sem feriado estadual coberto (sem dado confiável)', () => {
    expect(describeStateHolidayToday('AC', 2026, 6, 15)).toBeNull();
    expect(describeStateHolidayToday('MT', 2026, 1, 1)).toBeNull();
  });

  it('dia sem feriado estadual pra essa UF', () => {
    expect(describeStateHolidayToday('SP', 2026, 7, 10)).toBeNull();
  });
});

describe('describeHolidayToday', () => {
  it('prioriza nacional sobre estadual', () => {
    expect(describeHolidayToday('SP', 2026, 4, 21)).toEqual({ name: 'Tiradentes', official: true, scope: 'nacional' });
  });

  it('cai pro estadual quando não há nacional', () => {
    expect(describeHolidayToday('SP', 2026, 7, 9)?.name).toBe('Revolução Constitucionalista');
  });

  it('null quando não há nenhum dos dois', () => {
    expect(describeHolidayToday('SP', 2026, 10, 22)).toBeNull();
  });
});
