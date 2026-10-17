import { summarizeTransactions } from '@zapbuddy/db';
import {
  getLast7DaysRange,
  getPriorFourWeeksRange,
  getMonthToDateRange,
  getPreviousMonthRange,
  getCurrentMonthRange,
} from '../time/zoned-ranges.js';

export type ProactiveSignal =
  | { type: 'category_spike'; category: string; currentWeekCents: number; weeklyAverageCents: number }
  | { type: 'monthly_pace'; projectedCents: number; previousMonthCents: number };

// Limiares deliberadamente conservadores (ADR 0003, decisão 1) — evitar
// mensagem proativa por ruído estatístico em valores pequenos ou variação
// normal do dia a dia.
const CATEGORY_SPIKE_MULTIPLIER = 1.4; // 40% acima da média
const CATEGORY_SPIKE_MIN_CENTS = 5_000; // R$50 — piso absoluto, não só percentual
const MONTHLY_PACE_MULTIPLIER = 1.2; // 20% acima do mês anterior

async function detectCategorySpike(accountId: string, timezone: string): Promise<ProactiveSignal | null> {
  const currentWeek = getLast7DaysRange(timezone);
  const priorFourWeeks = getPriorFourWeeksRange(timezone);

  const [currentWeekSummary, priorSummary] = await Promise.all([
    summarizeTransactions(accountId, currentWeek.startIso, currentWeek.endIso),
    summarizeTransactions(accountId, priorFourWeeks.startIso, priorFourWeeks.endIso),
  ]);

  let worst: { category: string; currentWeekCents: number; weeklyAverageCents: number; ratio: number } | null = null;

  for (const [category, currentWeekCents] of Object.entries(currentWeekSummary.byCategory)) {
    if (currentWeekCents < CATEGORY_SPIKE_MIN_CENTS) continue;

    const priorTotalCents = priorSummary.byCategory[category] ?? 0;
    const weeklyAverageCents = priorTotalCents / 4;
    // Sem histórico de 4 semanas nessa categoria, não há baseline confiável
    // pra comparar — melhor não disparar do que comparar contra zero.
    if (weeklyAverageCents <= 0) continue;

    const ratio = currentWeekCents / weeklyAverageCents;
    if (ratio >= CATEGORY_SPIKE_MULTIPLIER && (!worst || ratio > worst.ratio)) {
      worst = { category, currentWeekCents, weeklyAverageCents, ratio };
    }
  }

  if (!worst) return null;
  return {
    type: 'category_spike',
    category: worst.category,
    currentWeekCents: worst.currentWeekCents,
    weeklyAverageCents: Math.round(worst.weeklyAverageCents),
  };
}

async function detectMonthlyPace(accountId: string, timezone: string, now: Date): Promise<ProactiveSignal | null> {
  const monthToDate = getMonthToDateRange(timezone, now);
  const previousMonth = getPreviousMonthRange(timezone, now);
  const currentMonthRange = getCurrentMonthRange(timezone, now);

  const [monthToDateSummary, previousMonthSummary] = await Promise.all([
    summarizeTransactions(accountId, monthToDate.startIso, monthToDate.endIso),
    summarizeTransactions(accountId, previousMonth.startIso, previousMonth.endIso),
  ]);

  const previousMonthCents = previousMonthSummary.totalExpenseCents;
  if (previousMonthCents <= 0) return null; // sem baseline do mês anterior, não dá pra comparar ritmo

  const totalDaysInMonth = Math.round(
    (new Date(currentMonthRange.endIso).getTime() - new Date(currentMonthRange.startIso).getTime()) / 86_400_000 + 1,
  );
  const daysElapsed = Math.max(
    1,
    Math.round((now.getTime() - new Date(currentMonthRange.startIso).getTime()) / 86_400_000) + 1,
  );
  // Não projeta nos primeiríssimos dias do mês — amostra pequena demais pra
  // extrapolar sem virar ruído (ex.: 1 gasto grande no dia 2 não vira "mês
  // vai estourar").
  if (daysElapsed < 5) return null;

  const projectedCents = Math.round((monthToDateSummary.totalExpenseCents / daysElapsed) * totalDaysInMonth);
  if (projectedCents < previousMonthCents * MONTHLY_PACE_MULTIPLIER) return null;

  return { type: 'monthly_pace', projectedCents, previousMonthCents };
}

/**
 * No máximo 1 sinal por chamada (prioriza categoria sobre ritmo — ADR 0003,
 * decisão 1) — quem chama decide se manda e loga, esta função só detecta.
 */
export async function detectProactiveSignal(accountId: string, timezone: string, now: Date = new Date()): Promise<ProactiveSignal | null> {
  const categorySpike = await detectCategorySpike(accountId, timezone);
  if (categorySpike) return categorySpike;

  return detectMonthlyPace(accountId, timezone, now);
}
