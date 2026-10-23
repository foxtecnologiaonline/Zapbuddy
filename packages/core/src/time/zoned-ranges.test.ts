import { describe, expect, it } from 'vitest';
import {
  getCurrentMonthRange,
  getLast7DaysRange,
  getTodayRange,
  getMonthToDateRange,
  getPreviousMonthRange,
  getPriorFourWeeksRange,
  getLocalHour,
  getLocalWeekday,
  getTomorrowRange,
  getNext7DaysRange,
  getDateKeyRange,
} from './zoned-ranges.js';

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

describe('getMonthToDateRange (Fase 3 — ritmo de gasto)', () => {
  it('vai do início do mês até o instante exato de referência (não até o fim do mês)', () => {
    const reference = new Date('2026-03-15T14:30:00.000Z');
    const { startIso, endIso } = getMonthToDateRange('America/Sao_Paulo', reference);

    expect(startIso).toBe('2026-03-01T03:00:00.000Z');
    expect(endIso).toBe(reference.toISOString());
  });
});

describe('getPreviousMonthRange (Fase 3 — baseline do ritmo de gasto)', () => {
  it('calcula o mês de calendário anterior completo', () => {
    const reference = new Date('2026-06-15T12:00:00.000Z');
    const { startIso, endIso } = getPreviousMonthRange('America/Sao_Paulo', reference);

    expect(startIso).toBe('2026-05-01T03:00:00.000Z');
    expect(endIso).toBe('2026-06-01T02:59:59.000Z');
  });

  it('atravessa virada de ano (mês atual = janeiro -> anterior = dezembro do ano anterior)', () => {
    const reference = new Date('2026-01-15T12:00:00.000Z');
    const { startIso, endIso } = getPreviousMonthRange('America/Sao_Paulo', reference);

    expect(startIso).toBe('2025-12-01T03:00:00.000Z');
    expect(endIso).toBe('2026-01-01T02:59:59.000Z');
  });
});

describe('getPriorFourWeeksRange (Fase 3 — baseline de categoria)', () => {
  it('cobre os dias -34 a -7 relativos à referência, sem incluir a semana atual', () => {
    const reference = new Date('2026-05-10T01:00:00.000Z'); // 2026-05-09 22:00 em São Paulo
    const { startIso, endIso } = getPriorFourWeeksRange('America/Sao_Paulo', reference);

    expect(startIso).toBe('2026-04-05T03:00:00.000Z');
    expect(endIso).toBe('2026-05-03T02:59:59.000Z');
  });
});

describe('getLocalHour (Fase 3 — sweep de insights proativos)', () => {
  it('converte a hora UTC pra hora local no fuso informado', () => {
    expect(getLocalHour('America/Sao_Paulo', new Date('2026-05-10T01:00:00.000Z'))).toBe(22);
    expect(getLocalHour('America/Sao_Paulo', new Date('2026-05-10T22:00:00.000Z'))).toBe(19);
  });
});

describe('getLocalWeekday (resumo semanal proativo)', () => {
  it('converte pro dia da semana local no fuso informado (0=domingo..6=sábado)', () => {
    // 2026-05-15T21:00:00Z = sexta 18h em São Paulo (UTC-3).
    const friday18h = new Date('2026-05-15T21:00:00.000Z');
    expect(getLocalWeekday('America/Sao_Paulo', friday18h)).toBe(5);
    expect(getLocalHour('America/Sao_Paulo', friday18h)).toBe(18);
  });

  it('cruza a virada de dia local corretamente (ainda sábado em São Paulo, já domingo em UTC)', () => {
    // 2026-05-10T01:00:00Z = sábado 22h em São Paulo.
    expect(getLocalWeekday('America/Sao_Paulo', new Date('2026-05-10T01:00:00.000Z'))).toBe(6);
  });
});

describe('getTomorrowRange / getNext7DaysRange / getDateKeyRange', () => {
  const reference = new Date('2026-05-10T01:00:00.000Z'); // 2026-05-09 22:00 em São Paulo

  it('amanhã é o dia local seguinte, não o dia UTC seguinte', () => {
    const { startIso, endIso } = getTomorrowRange('America/Sao_Paulo', reference);
    expect(startIso).toBe('2026-05-10T03:00:00.000Z');
    expect(endIso).toBe('2026-05-11T02:59:59.000Z');
  });

  it('próximos 7 dias cobrem hoje + 6 dias à frente', () => {
    const { startIso, endIso } = getNext7DaysRange('America/Sao_Paulo', reference);
    expect(startIso).toBe('2026-05-09T03:00:00.000Z');
    expect(endIso).toBe('2026-05-16T02:59:59.000Z');
  });

  it('janela por datas locais é inclusiva nas duas pontas', () => {
    const { startIso, endIso } = getDateKeyRange('America/Sao_Paulo', '2026-05-30', '2026-05-31');
    expect(startIso).toBe('2026-05-30T03:00:00.000Z');
    expect(endIso).toBe('2026-06-01T02:59:59.000Z');
  });

  it('rejeita formato inválido e intervalo invertido', () => {
    expect(() => getDateKeyRange('America/Sao_Paulo', '30/05/2026', '2026-05-31')).toThrow(/YYYY-MM-DD/);
    expect(() => getDateKeyRange('America/Sao_Paulo', '2026-05-31', '2026-05-30')).toThrow(/anterior/);
  });
});
