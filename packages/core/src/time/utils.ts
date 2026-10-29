import { describeNationalHolidayToday } from '../digest/holidays.js';
import { datePartsInZone } from './zoned-ranges.js';
import { findPlace } from './places.js';

/**
 * Utilitários de tempo exatos (sugestão #12): hora em outro lugar, dias até
 * uma data e próximo feriado nacional. Puro e determinístico — o modelo só
 * repete o número, nunca faz a conta de cabeça.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAYS_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export type TimeInPlaceResult =
  | { found: false }
  | {
      found: true;
      place: string;
      time: string;
      weekday: string;
      /** Diferença do lugar em relação ao fuso da pessoa, em horas (pode ser fracionada). Positivo = o lugar está adiantado. */
      hours_ahead_of_you: number;
      /** "mesmo dia" | "amanhã" | "ontem" visto de quem perguntou. */
      day_relation: 'same_day' | 'next_day' | 'previous_day';
    };

function offsetMinutes(timeZone: string, at: Date): number {
  const asZoned = new Date(at.toLocaleString('en-US', { timeZone }));
  const asUtc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((asZoned.getTime() - asUtc.getTime()) / 60000);
}

export function timeInPlace(placeQuery: string, userTimeZone: string, now: Date = new Date()): TimeInPlaceResult {
  const place = findPlace(placeQuery);
  if (!place) return { found: false };

  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: place.timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const there = datePartsInZone(place.timeZone, now);
  const here = datePartsInZone(userTimeZone, now);
  const thereDay = Date.UTC(there.year, there.month - 1, there.day);
  const hereDay = Date.UTC(here.year, here.month - 1, here.day);
  const dayDiff = Math.round((thereDay - hereDay) / MS_PER_DAY);
  const weekday = WEEKDAYS_PT[new Date(thereDay).getUTCDay()]!;

  return {
    found: true,
    place: place.name,
    time,
    weekday,
    hours_ahead_of_you: (offsetMinutes(place.timeZone, now) - offsetMinutes(userTimeZone, now)) / 60,
    day_relation: dayDiff > 0 ? 'next_day' : dayDiff < 0 ? 'previous_day' : 'same_day',
  };
}

/** Dias corridos entre HOJE (no fuso da pessoa) e uma data YYYY-MM-DD. Negativo = já passou. null se a data não existe. */
export function daysUntilDate(dateKey: string, userTimeZone: string, now: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const target = new Date(Date.UTC(year, month - 1, day));
  // Rejeita 2026-02-31 etc. (Date normaliza pro mês seguinte).
  if (target.getUTCFullYear() !== year || target.getUTCMonth() !== month - 1 || target.getUTCDate() !== day) return null;

  const today = datePartsInZone(userTimeZone, now);
  return Math.round((target.getTime() - Date.UTC(today.year, today.month - 1, today.day)) / MS_PER_DAY);
}

export interface NextHoliday {
  name: string;
  date: string;
  days_from_today: number;
  weekday: string;
  /** false = ponto facultativo (Carnaval, Corpus Christi). */
  official: boolean;
}

/** Próximo feriado NACIONAL a partir de hoje (inclusive), olhando até 400 dias. Estadual/municipal não entram (sem dado confiável de cidade). */
export function nextNationalHoliday(userTimeZone: string, now: Date = new Date()): NextHoliday | null {
  const today = datePartsInZone(userTimeZone, now);
  for (let offset = 0; offset <= 400; offset += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const holiday = describeNationalHolidayToday(year, month, day);
    if (holiday) {
      return {
        name: holiday.name,
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        days_from_today: offset,
        weekday: WEEKDAYS_PT[date.getUTCDay()]!,
        official: holiday.official,
      };
    }
  }
  return null;
}
