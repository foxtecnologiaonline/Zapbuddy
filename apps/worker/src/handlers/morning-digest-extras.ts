import {
  hasSentImportantDateReminderThisYear,
  listActiveHabits,
  listBudgets,
  listGoals,
  listHabitCheckinDates,
  listImportantDates,
  summarizeTransactions,
} from '@zapbuddy/db';
import {
  computeHabitStats,
  getMonthComparisonRanges,
  getYesterdayRange,
  localDateKey,
  upcomingImportantDates,
  type MorningExtrasData,
  type UpcomingImportantDate,
} from '@zapbuddy/core';

export type Safely = <T>(source: string, run: () => Promise<T>, fallback: T) => Promise<T>;

export interface MorningExtrasInput {
  accountId: string;
  timezone: string;
  now: Date;
  year: number;
  month: number;
  day: number;
  includeAgenda: boolean;
  includeFinance: boolean;
  safely: Safely;
}

const DAY_MS = 86_400_000;
const MAX_ROWS_PER_SUMMARY = 2000;

function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round((new Date(`${toKey}T00:00:00Z`).getTime() - new Date(`${fromKey}T00:00:00Z`).getTime()) / DAY_MS);
}

/**
 * Busca as informações extras do resumo matinal. Cada fonte tem fallback
 * próprio (`safely`): uma que falhe some da mensagem, nunca derruba o resto
 * nem vira "vazio" inventado. Agenda/tarefas ligadas (includeAgenda) liberam
 * datas importantes, hábitos/metas e a prévia de amanhã; financeiro ligado
 * libera o retrato do dinheiro — mesmas duas chaves de set_morning_digest_preferences.
 *
 * `todayDates` são as datas importantes de HOJE ainda sem o aviso das 9h: o
 * handler as marca como avisadas quando a mensagem sai, pro aviso separado
 * não repetir a mesma informação.
 */
export async function loadMorningExtras(input: MorningExtrasInput): Promise<{ extras: MorningExtrasData; todayDates: UpcomingImportantDate[] }> {
  const { accountId, timezone, now, year, month, day, includeAgenda, includeFinance, safely } = input;
  const todayKey = localDateKey(timezone, now);

  const [importantDates, habits, goals, finance] = await Promise.all([
    includeAgenda
      ? safely(
          'extras_dates',
          async () => {
            const upcoming = upcomingImportantDates(await listImportantDates(accountId, 200), year, month, day);
            const sentFlags = await Promise.all(
              upcoming.map((item) => (item.offsetDays === 0 ? hasSentImportantDateReminderThisYear(item.id, year) : Promise.resolve(false))),
            );
            return upcoming.filter((_, index) => !sentFlags[index]);
          },
          [] as UpcomingImportantDate[],
        )
      : Promise.resolve([] as UpcomingImportantDate[]),
    includeAgenda
      ? safely(
          'extras_habits',
          async () => {
            const [active, datesByHabit] = await Promise.all([listActiveHabits(accountId), listHabitCheckinDates(accountId, todayKey)]);
            return active.map((habit) => {
              const stats = computeHabitStats(datesByHabit[habit.id] ?? [], todayKey);
              return { name: habit.name, currentStreak: stats.currentStreak, doneToday: stats.doneToday };
            });
          },
          [],
        )
      : Promise.resolve([]),
    includeAgenda
      ? safely(
          'extras_goals',
          async () =>
            (await listGoals(accountId))
              .filter((goal) => goal.deadline !== null)
              .map((goal) => ({
                title: goal.title,
                savedCents: goal.saved_cents,
                targetCents: goal.target_cents,
                daysLeft: daysBetweenKeys(todayKey, goal.deadline!.slice(0, 10)),
              })),
          [],
        )
      : Promise.resolve([]),
    includeFinance
      ? safely(
          'extras_finance',
          async () => {
            const yesterday = getYesterdayRange(timezone, now);
            const comparison = getMonthComparisonRanges(timezone, now);
            const [yesterdaySummary, current, previous, budgets] = await Promise.all([
              summarizeTransactions(accountId, yesterday.startIso, yesterday.endIso),
              comparison ? summarizeTransactions(accountId, comparison.current.startIso, comparison.current.endIso) : Promise.resolve(null),
              comparison ? summarizeTransactions(accountId, comparison.previous.startIso, comparison.previous.endIso) : Promise.resolve(null),
              comparison ? listBudgets(accountId) : Promise.resolve([]),
            ]);
            // A listagem de transações tem teto (2000 por consulta): se bateu nele, o total do mês
            // estaria incompleto — melhor omitir a linha do que mostrar um número errado.
            const complete = (summary: { count: number } | null) => summary !== null && summary.count < MAX_ROWS_PER_SUMMARY;
            return {
              yesterdayExpenseCents: yesterdaySummary.totalExpenseCents,
              monthExpenseCents: complete(current) ? current!.totalExpenseCents : null,
              previousMonthExpenseCents: complete(previous) ? previous!.totalExpenseCents : null,
              budgets: budgets.map((budget) => ({
                category: budget.category,
                limitCents: budget.limit_cents,
                spentCents: complete(current) ? (current!.byCategory[budget.category] ?? 0) : 0,
              })),
            };
          },
          null,
        )
      : Promise.resolve(null),
  ]);

  return {
    // `tomorrow` (agenda, tarefas e previsão) o handler monta: usa o que ele já buscou pro dia de hoje.
    extras: { importantDates, finance, habits, goals, tomorrow: null },
    todayDates: importantDates.filter((item) => item.offsetDays === 0),
  };
}
