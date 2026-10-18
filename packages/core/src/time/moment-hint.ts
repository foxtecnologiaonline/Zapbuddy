import { getLocalHour, getLocalWeekday } from './zoned-ranges.js';

function dayAndDaysInMonth(timeZone: string, referenceDate: Date): { day: number; daysInMonth: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(
    referenceDate,
  );
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { day, daysInMonth };
}

/**
 * Dica solta de "momento" (hora/dia/mês) pra dar ao system prompt — nunca um
 * template mecânico de saudação, só um detalhe que o Tom PODE usar de
 * leve se for natural (ex.: um "boa noite" em vez de ignorar que já é tarde).
 * Retorna null na maioria do tempo de propósito: um hint presente sempre
 * virasse ruído repetitivo, o oposto do que a suggestion #10 (turbinar o
 * tom) pediu. Prioridade quando mais de uma condição bate: fim de mês >
 * sexta à tarde/noite > começo da manhã > altas horas.
 */
export function describeMoment(timeZone: string, referenceDate: Date = new Date()): string | null {
  const hour = getLocalHour(timeZone, referenceDate);
  const weekday = getLocalWeekday(timeZone, referenceDate);
  const { day, daysInMonth } = dayAndDaysInMonth(timeZone, referenceDate);

  if (daysInMonth - day <= 2) return 'fim de mês';
  if (weekday === 5 && hour >= 16) return 'sexta-feira, fim de semana de trabalho chegando';
  if (hour >= 5 && hour < 8) return 'começo da manhã';
  if (hour >= 23 || hour < 5) return 'altas horas';

  return null;
}
