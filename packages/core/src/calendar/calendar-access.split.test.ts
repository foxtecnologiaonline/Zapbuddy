import { describe, expect, it } from 'vitest';
import { splitAgendaByDay } from './calendar-access.js';

// Amanhã (23/10) em São Paulo começa em 2026-10-23T03:00:00Z.
const TOMORROW_START = '2026-10-23T03:00:00.000Z';
const TOMORROW_KEY = '2026-10-23';

describe('splitAgendaByDay', () => {
  it('separa hoje e amanhã pelo instante e ordena por horário', () => {
    const result = splitAgendaByDay(
      [
        { startIso: '2026-10-23T12:00:00.000Z', title: 'Amanhã cedo' },
        { startIso: '2026-10-22T17:00:00.000Z', title: 'Hoje tarde' },
        { startIso: '2026-10-22T12:00:00.000Z', title: 'Hoje cedo' },
      ],
      TOMORROW_START,
      TOMORROW_KEY,
    );
    expect(result.today.map((event) => event.title)).toEqual(['Hoje cedo', 'Hoje tarde']);
    expect(result.tomorrow.map((event) => event.title)).toEqual(['Amanhã cedo']);
  });

  it('a virada da meia-noite local cai do lado certo (02:59Z ainda é hoje, 03:00Z já é amanhã)', () => {
    const result = splitAgendaByDay(
      [
        { startIso: '2026-10-23T02:59:00.000Z', title: 'Quase meia-noite' },
        { startIso: '2026-10-23T03:00:00.000Z', title: 'Meia-noite' },
      ],
      TOMORROW_START,
      TOMORROW_KEY,
    );
    expect(result.today.map((event) => event.title)).toEqual(['Quase meia-noite']);
    expect(result.tomorrow.map((event) => event.title)).toEqual(['Meia-noite']);
  });

  it('evento de dia inteiro (só a data) vai pelo dia', () => {
    const result = splitAgendaByDay(
      [{ startIso: '2026-10-22', title: 'Feriado de hoje' }, { startIso: '2026-10-23', title: 'Viagem amanhã' }],
      TOMORROW_START,
      TOMORROW_KEY,
    );
    expect(result.today.map((event) => event.title)).toEqual(['Feriado de hoje']);
    expect(result.tomorrow.map((event) => event.title)).toEqual(['Viagem amanhã']);
  });

  it('sem eventos: dois dias vazios', () => {
    expect(splitAgendaByDay([], TOMORROW_START, TOMORROW_KEY)).toEqual({ today: [], tomorrow: [] });
  });
});
