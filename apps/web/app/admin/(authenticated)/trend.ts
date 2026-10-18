// Fuso igual ao resto do admin (formatDateTime em components.tsx) — um dia
// "virar" no horário errado faria o balde de hoje/ontem ficar errado perto
// da meia-noite.
const TIMEZONE = 'America/Sao_Paulo';
export const TREND_WINDOW_DAYS = 14;

function dayKey(iso: string): string {
  // Locale en-CA devolve YYYY-MM-DD — truque conveniente pra chave de dia
  // comparável como string, sem lib de data externa.
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function lastNDays(days: number): string[] {
  const keys: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i -= 1) {
    keys.push(dayKey(new Date(now - i * 24 * 60 * 60 * 1000).toISOString()));
  }
  return keys;
}

/** Balde de contagem por dia (últimos TREND_WINDOW_DAYS, mais antigo primeiro) a partir de uma lista de timestamps — pra alimentar o Sparkline. */
export function bucketCountsByDay(timestamps: string[], days: number = TREND_WINDOW_DAYS): number[] {
  const dayKeys = lastNDays(days);
  const counts = new Map(dayKeys.map((key) => [key, 0]));
  for (const ts of timestamps) {
    const key = dayKey(ts);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return dayKeys.map((key) => counts.get(key) ?? 0);
}
