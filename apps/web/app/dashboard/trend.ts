// Mesmo padrão de apps/web/app/admin/(authenticated)/trend.ts (bucketCountsByDay)
// — separado de charts.tsx de propósito: função pura sem JSX, testável sem
// transform de React.

export const TREND_WINDOW_DAYS = 14;

function dayKey(iso: string, timeZone: string): string {
  // Locale en-CA devolve YYYY-MM-DD — truque conveniente pra chave de dia
  // comparável como string, sem lib de data externa.
  return new Date(iso).toLocaleDateString('en-CA', { timeZone });
}

function lastNDays(days: number, timeZone: string): string[] {
  const keys: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i -= 1) {
    keys.push(dayKey(new Date(now - i * 24 * 60 * 60 * 1000).toISOString(), timeZone));
  }
  return keys;
}

/** Soma de `amount_cents` por dia (últimos `days`, mais antigo primeiro) — alimenta o Sparkline de tendência de gasto. */
export function bucketSumsByDay(
  entries: { occurred_at: string; amount_cents: number }[],
  timeZone: string,
  days: number = TREND_WINDOW_DAYS,
): number[] {
  const dayKeys = lastNDays(days, timeZone);
  const sums = new Map(dayKeys.map((key) => [key, 0]));
  for (const entry of entries) {
    const key = dayKey(entry.occurred_at, timeZone);
    if (sums.has(key)) sums.set(key, (sums.get(key) ?? 0) + entry.amount_cents);
  }
  return dayKeys.map((key) => sums.get(key) ?? 0);
}
