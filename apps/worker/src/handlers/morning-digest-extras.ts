import {
  hasSentImportantDateReminderThisYear,
  listActiveHabits,
  listBudgets,
  listGoals,
  listHabitCheckinDates,
  listImportantDates,
  listPendingTasksDueBetween,
  summarizeTransactions,
} from '@zapbuddy/db';
import {
  computeHabitStats,
  getMonthComparisonRanges,
  getTomorrowAgendaEvents,
  getTomorrowRange,
  getYesterdayRange,
  localDateKey,
  upcomingImportantDates,
  type MorningExtrasData,
  type TodayWeatherSummary,
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
  weather: TodayWeatherSummary | null;
  safely: Safely;
}

const DAY_MS = 86_400_000;

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
  const { accountId, timezone, now, year, month, day, includeAgenda, includeFinance, weather, safely } = input;
  const todayKey = localDateKey(timezone, now);
  const tomorrowRange = getTomorrowRange(timezone, now);

  const [importantDates, tomorrowEvents, tomorrowTasks, habits, goals, finance] = await Promise.all([
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
    includeAgenda ? safely('extras_tomorrow_events', () => getTomorrowAgendaEvents(accountId, timezone), []) : Promise.resolve([]),
    includeAgenda
      ? safely('extras_tomorrow_tasks', () => listPendingTasksDueBetween(accountId, tomorrowRange.startIso, tomorrowRange.endIso), [])
      : Promise.resolve([]),
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
            return {
              yesterdayExpenseCents: yesterdaySummary.totalExpenseCents,
              monthExpenseCents: current?.totalExpenseCents ?? null,
              previousMonthExpenseCents: previous?.totalExpenseCents ?? null,
              budgets: budgets.map((budget) => ({
                category: budget.category,
                limitCents: budget.limit_cents,
                spentCents: current?.byCategory[budget.category] ?? 0,
              })),
            };
          },
          null,
        )
      : Promise.resolve(null),
  ]);

  const tomorrowWeather = weather?.tomorrow ?? null;
  const tomorrow = includeAgenda
    ? {
        events: tomorrowEvents,
        tasks: tomorrowTasks.map((task) => ({ title: task.title })),
        weather: tomorrowWeather,
      }
    : null;

  return {
    extras: { importantDates, finance, habits, goals, tomorrow },
    todayDates: importantDates.filter((item) => item.offsetDays === 0),
  };
}
