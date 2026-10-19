/**
 * Converte um instante "meia-noite local" (ano/mês/dia, 00:00:00 ou
 * 23:59:59) no fuso informado para o Date UTC equivalente — sem depender de
 * nenhuma lib externa (date-fns-tz, luxon etc.), só a API Intl nativa do
 * Node/V8. Técnica: monta um Date tratando os campos como se já fossem UTC,
 * mede o offset real do fuso alvo nesse instante (via toLocaleString) e
 * corrige por ele.
 *
 * Movido de apps/web/lib/timezone.ts pra ser compartilhado com
 * packages/core/src/llm/tools/finance.ts — o resumo financeiro via WhatsApp
 * precisa dos mesmos limites de dia/semana no fuso do usuário que o
 * dashboard já calculava corretamente, em vez de duplicar a lógica (ou,
 * pior, deixar o modelo gerar from/to livres sem âncora de fuso).
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

export interface DateRange {
  startIso: string;
  endIso: string;
}

/** Hora local (0-23) no fuso informado — usado pelo sweep horário de insights proativos (Fase 3) pra decidir se "é a hora" de cada conta. */
export function getLocalHour(timeZone: string, referenceDate: Date = new Date()): number {
  const hourPart = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).formatToParts(referenceDate).find((p) => p.type === 'hour')?.value;
  // '24' representa meia-noite em algumas locales do Intl com hour12 false — normaliza pro 0-23 esperado.
  const hour = Number(hourPart);
  return hour === 24 ? 0 : hour;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/**
 * Dia da semana local (0=domingo..6=sábado) no fuso informado — usado pelo
 * sweep horário (insights-sweep.ts) pra decidir o dia do resumo semanal
 * proativo, mesma mecânica de getLocalHour acima pro insight de anomalia.
 */
export function getLocalWeekday(timeZone: string, referenceDate: Date = new Date()): number {
  const weekdayName = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(referenceDate);
  return WEEKDAY_INDEX[weekdayName] ?? 0;
}

export function datePartsInZone(timeZone: string, referenceDate: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(referenceDate);

  return {
    year: Number(parts.find((p) => p.type === 'year')?.value),
    month: Number(parts.find((p) => p.type === 'month')?.value),
    day: Number(parts.find((p) => p.type === 'day')?.value),
  };
}

/**
 * Ano/mês/dia local no fuso informado — usado pelo sweep de datas
 * importantes (insights-sweep.ts) pra comparar "hoje" com o month/day
 * guardado em important_dates, sem depender do fuso do servidor.
 */
export function getLocalDateParts(timeZone: string, referenceDate: Date = new Date()): { year: number; month: number; day: number } {
  return datePartsInZone(timeZone, referenceDate);
}

/** Início (00:00:00) e fim (23:59:59) do dia corrente NO FUSO DO USUÁRIO. */
export function getTodayRange(timeZone: string, referenceDate: Date = new Date()): DateRange {
  const { year, month, day } = datePartsInZone(timeZone, referenceDate);
  const start = zonedWallTimeToUtc(year, month, day, 0, 0, 0, timeZone);
  const end = zonedWallTimeToUtc(year, month, day, 23, 59, 59, timeZone);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Últimos 7 dias corridos (hoje + 6 dias anteriores) NO FUSO DO USUÁRIO —
 * janela rolante, não "semana de calendário" (evita a ambiguidade de
 * domingo-vs-segunda como início de semana, que não está definida em
 * nenhum outro lugar do produto).
 */
export function getLast7DaysRange(timeZone: string, referenceDate: Date = new Date()): DateRange {
  const { year, month, day } = datePartsInZone(timeZone, referenceDate);
  const start = zonedWallTimeToUtc(year, month, day - 6, 0, 0, 0, timeZone);
  const end = zonedWallTimeToUtc(year, month, day, 23, 59, 59, timeZone);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Início e fim do mês corrente NO FUSO DO USUÁRIO, não no fuso do servidor
 * (que na Vercel roda em UTC). Sem isso, uma transação feita às 22h em
 * horário de Brasília (America/Sao_Paulo, UTC-3) podia cair no mês errado
 * no resumo do dashboard, porque já seria 01h do dia seguinte em UTC.
 */
export function getCurrentMonthRange(timeZone: string, referenceDate: Date = new Date()): DateRange {
  const { year, month } = datePartsInZone(timeZone, referenceDate);

  const start = zonedWallTimeToUtc(year, month, 1, 0, 0, 0, timeZone);
  // Dia 0 do mês seguinte = último dia do mês atual (comportamento padrão de Date).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = zonedWallTimeToUtc(year, month, lastDay, 23, 59, 59, timeZone);

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Início do mês corrente até AGORA (não até o fim do mês) — usado pra
 * projetar ritmo de gasto (Fase 3: insights proativos) comparando "quanto já
 * foi gasto nos N dias decorridos" com o total do mês anterior.
 */
export function getMonthToDateRange(timeZone: string, referenceDate: Date = new Date()): DateRange {
  const { year, month } = datePartsInZone(timeZone, referenceDate);
  const start = zonedWallTimeToUtc(year, month, 1, 0, 0, 0, timeZone);
  return { startIso: start.toISOString(), endIso: referenceDate.toISOString() };
}

/** Mês de calendário anterior completo NO FUSO DO USUÁRIO — baseline de comparação pro ritmo de gasto. */
export function getPreviousMonthRange(timeZone: string, referenceDate: Date = new Date()): DateRange {
  const { year, month } = datePartsInZone(timeZone, referenceDate);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const start = zonedWallTimeToUtc(prevYear, prevMonth, 1, 0, 0, 0, timeZone);
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const end = zonedWallTimeToUtc(prevYear, prevMonth, lastDay, 23, 59, 59, timeZone);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Os 28 dias imediatamente ANTES dos últimos 7 (dias -8 a -35) NO FUSO DO
 * USUÁRIO — baseline de 4 semanas pra detectar categoria de gasto fora do
 * padrão (Fase 3: insights proativos), sem incluir a própria semana atual
 * na média que a compara.
 */
export function getPriorFourWeeksRange(timeZone: string, referenceDate: Date = new Date()): DateRange {
  const { year, month, day } = datePartsInZone(timeZone, referenceDate);
  const start = zonedWallTimeToUtc(year, month, day - 34, 0, 0, 0, timeZone);
  const end = zonedWallTimeToUtc(year, month, day - 7, 23, 59, 59, timeZone);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Os 7 dias anteriores à janela de `getLast7DaysRange` (dias -13 a -7) NO FUSO DO USUÁRIO — base de comparação do resumo semanal. */
export function getPreviousWeekRange(timeZone: string, referenceDate: Date = new Date()): DateRange {
  const { year, month, day } = datePartsInZone(timeZone, referenceDate);
  const start = zonedWallTimeToUtc(year, month, day - 13, 0, 0, 0, timeZone);
  const end = zonedWallTimeToUtc(year, month, day - 7, 23, 59, 59, timeZone);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
