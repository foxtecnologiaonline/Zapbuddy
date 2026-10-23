/**
 * Sequência de hábito — pura e testável sem banco. Trabalha só com chaves de
 * data locais (YYYY-MM-DD), então fuso e horário de verão não entram na
 * conta: quem converte "agora" para a data local da pessoa é `localDateKey`.
 */

export function localDateKey(timeZone: string, date: Date = new Date()): string {
  // en-CA formata YYYY-MM-DD nativamente (mesma técnica de streak/compute.ts).
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface HabitStats {
  doneToday: boolean;
  /** Dias seguidos até hoje — ou até ontem, se hoje ainda não foi marcado (sequência em andamento não "quebra" antes do dia acabar). */
  currentStreak: number;
  /** Dias marcados nos últimos 7 dias (hoje + 6 anteriores). */
  last7Days: number;
}

export function computeHabitStats(checkinDates: string[], todayKey: string): HabitStats {
  const dates = new Set(checkinDates);
  const doneToday = dates.has(todayKey);

  let cursor = doneToday ? todayKey : shiftDateKey(todayKey, -1);
  let currentStreak = 0;
  while (dates.has(cursor)) {
    currentStreak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  let last7Days = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    if (dates.has(shiftDateKey(todayKey, -offset))) last7Days += 1;
  }

  return { doneToday, currentStreak, last7Days };
}
