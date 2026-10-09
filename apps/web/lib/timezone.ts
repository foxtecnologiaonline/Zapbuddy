/**
 * Converte um instante "meia-noite local" (ano/mês/dia, 00:00:00 ou
 * 23:59:59) no fuso informado para o Date UTC equivalente — sem depender de
 * nenhuma lib externa (date-fns-tz, luxon etc.), só a API Intl nativa do
 * Node/V8. Técnica: monta um Date tratando os campos como se já fossem UTC,
 * mede o offset real do fuso alvo nesse instante (via toLocaleString) e
 * corrige por ele.
 */
function zonedWallTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const asIfUtc = new Date(utcGuess.toLocaleString('en-US', { timeZone: 'UTC' }));
  const asIfZoned = new Date(utcGuess.toLocaleString('en-US', { timeZone }));
  const offsetMs = asIfUtc.getTime() - asIfZoned.getTime();
  return new Date(utcGuess.getTime() + offsetMs);
}

export interface MonthRange {
  startIso: string;
  endIso: string;
}

/**
 * Início e fim do mês corrente NO FUSO DO USUÁRIO, não no fuso do servidor
 * (que na Vercel roda em UTC). Sem isso, uma transação feita às 22h em
 * horário de Brasília (America/Sao_Paulo, UTC-3) podia cair no mês errado
 * no resumo do dashboard, porque já seria 01h do dia seguinte em UTC.
 */
export function getCurrentMonthRange(timeZone: string, referenceDate: Date = new Date()): MonthRange {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(referenceDate);

  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);

  const start = zonedWallTimeToUtc(year, month, 1, 0, 0, 0, timeZone);
  // Dia 0 do mês seguinte = último dia do mês atual (comportamento padrão de Date).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = zonedWallTimeToUtc(year, month, lastDay, 23, 59, 59, timeZone);

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
