import { datePartsInZone } from '../time/zoned-ranges.js';
import { describeNationalHolidayToday, easterSunday } from './holidays.js';

/**
 * Datas que a pessoa vai estar vendo na cidade, no jornal e no WhatsApp: feriados nacionais e datas comemorativas.
 * Tudo CALCULADO por regra (Páscoa, "2º domingo de maio", "sexta depois da 4ª quinta de novembro"), nunca digitado
 * por ano — então não envelhece e o modelo nunca precisa chutar uma data de cabeça. Serve pro Tom conversar
 * ("Black Friday semana que vem, hein"), não pra criar nada: lembrete e data importante continuam só com o "sim" dela.
 */

export interface UpcomingDate {
  name: string;
  /** 0 = hoje. */
  daysAhead: number;
  year: number;
  month: number;
  day: number;
  /** Dia da semana (0 = domingo). */
  weekday: number;
  kind: 'feriado' | 'ponto facultativo' | 'data comemorativa';
}

interface YMD {
  year: number;
  month: number;
  day: number;
}

/** N-ésimo dia da semana (0 = domingo) de um mês. Ex.: 2º domingo de maio = nthWeekday(ano, 5, 0, 2). */
function nthWeekday(year: number, month: number, weekday: number, nth: number): number {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - firstWeekday + 7) % 7) + (nth - 1) * 7;
}

const FIXED_COMMEMORATIVE: Array<{ month: number; day: number; name: string }> = [
  { month: 6, day: 12, name: 'Dia dos Namorados' },
  { month: 6, day: 24, name: 'São João (festas juninas)' },
  { month: 7, day: 20, name: 'Dia do Amigo' },
  { month: 10, day: 12, name: 'Dia das Crianças' },
  { month: 12, day: 24, name: 'Véspera de Natal' },
  { month: 12, day: 31, name: 'Réveillon' },
];

/** Data comemorativa (não feriado) que cai nesse dia, por regra. */
export function describeCommemorativeDate(year: number, month: number, day: number): string | null {
  const fixed = FIXED_COMMEMORATIVE.find((item) => item.month === month && item.day === day);
  if (fixed) return fixed.name;
  if (month === 5 && day === nthWeekday(year, 5, 0, 2)) return 'Dia das Mães';
  if (month === 8 && day === nthWeekday(year, 8, 0, 2)) return 'Dia dos Pais';
  // Black Friday = sexta depois do Dia de Ação de Graças (4ª quinta de novembro).
  if (month === 11 && day === nthWeekday(year, 11, 4, 4) + 1) return 'Black Friday';
  const easter = easterSunday(year);
  if (month === easter.month && day === easter.day) return 'Páscoa';
  return null;
}

function addDays(from: YMD, days: number): YMD {
  const date = new Date(Date.UTC(from.year, from.month - 1, from.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * Datas de hoje até daqui a `windowDays` dias, no calendário da pessoa. Um dia pode ter mais de uma
 * (12/10 é feriado e Dia das Crianças). `now` e `timeZone` definem qual é o "hoje" dela.
 */
export function listUpcomingDates(now: Date, timeZone: string, windowDays = 21): UpcomingDate[] {
  const today = datePartsInZone(timeZone, now);
  const found: UpcomingDate[] = [];

  for (let offset = 0; offset <= windowDays; offset += 1) {
    const date = addDays(today, offset);
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    const base = { daysAhead: offset, ...date, weekday };

    const holiday = describeNationalHolidayToday(date.year, date.month, date.day);
    if (holiday) found.push({ ...base, name: holiday.name, kind: holiday.official ? 'feriado' : 'ponto facultativo' });

    const commemorative = describeCommemorativeDate(date.year, date.month, date.day);
    if (commemorative) found.push({ ...base, name: commemorative, kind: 'data comemorativa' });
  }
  return found;
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function describeWhen(item: UpcomingDate): string {
  const date = `${String(item.day).padStart(2, '0')}/${String(item.month).padStart(2, '0')}`;
  if (item.daysAhead === 0) return `hoje (${date})`;
  if (item.daysAhead === 1) return `amanhã (${date})`;
  return `${WEEKDAYS[item.weekday]}, ${date}, em ${item.daysAhead} dias`;
}

/**
 * Bloco da camada volátil do prompt (muda por dia, nunca é cacheado). Vazio quando não há nada por perto:
 * a maior parte do ano o Tom não ganha nenhuma linha extra. No máximo 3 datas, as mais próximas.
 */
export function buildUpcomingDatesBlock(timeZone: string, now: Date = new Date(), windowDays = 21): string {
  const dates = listUpcomingDates(now, timeZone, windowDays).slice(0, 3);
  if (dates.length === 0) return '';
  const lines = dates.map((item) => `- ${item.name} (${item.kind}): ${describeWhen(item)}`).join('\n');
  return `

Datas por vir no calendário (calculadas, pode confiar nelas; só pra conversar com naturalidade — mencione no máximo UMA, só se vier a propósito, em forma de pergunta leve e nunca pra vender; nunca crie lembrete ou data importante sem o "sim" dela):
${lines}`;
}
