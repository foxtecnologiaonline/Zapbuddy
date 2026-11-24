import {
  countHabitCheckinsSince,
  listActiveHabits,
  listActiveRecurringBills,
  listCompletedTasksBetween,
  listGoals,
  listImportantDates,
  listPendingReminders,
  listPersonalGoals,
  listHabitCheckinDates,
  listOverduePendingTasks,
  listPendingTasksDueBetween,
  listTasks,
  listDistinctToolNamesUsedSince,
  listProactiveRefs,
  summarizeTransactions,
  logger,
} from '@zapbuddy/db';
import { computeHabitStats, localDateKey, shiftDateKey } from '../habits/streak.js';
import { datePartsInZone, getLast7DaysRange, getMonthComparisonRanges, getNext7DaysRange, getPreviousMonthRange, getPreviousWeekRange, getTodayRange } from '../time/zoned-ranges.js';
import { percentChange } from '../calc/finance.js';
import { daysUntilNextOccurrence } from '../commands/collections-format.js';
import { formatMonthReview, type MonthReviewData } from './month-review.js';
import { formatSuggestions, pickSuggestions, type SuggestionSignals } from './suggestions.js';
import { loadDayOverview } from '../planning/day-overview.js';
import { formatDayOverview } from '../planning/day-format.js';
import { formatDayClose, formatWeekReview, type DayCloseData, type WeekReviewData } from './messages.js';
import { pickTip, SKILLS, type Skill } from '../commands/skills.js';

export const SKILL_TIP_KIND = 'skill_tip';
const TIP_LOOKBACK_DAYS = 90;

export interface RoutineSubject {
  accountId: string;
  timeZone: string;
  quietHoursStart: number;
  quietHoursEnd: number;
  name: string | null;
}

async function fallback<T>(label: string, value: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    logger.warn('routine_source_failed', { label, error: error instanceof Error ? error.message : String(error) });
    return value;
  }
}

/** Mensagem de fechamento do dia (3 balões), ou null se nada pôde ser lido (melhor não mandar do que mandar vazio e enganoso). */
export async function buildDayCloseMessage(subject: RoutineSubject, now: Date = new Date()): Promise<string | null> {
  const today = getTodayRange(subject.timeZone, now);
  const todayKey = localDateKey(subject.timeZone, now);

  const [completed, spend, pending, habitsMissing, tomorrow] = await Promise.all([
    fallback<string[] | null>('completed', null, async () => (await listCompletedTasksBetween(subject.accountId, today.startIso, today.endIso)).map((task) => task.title)),
    fallback<{ cents: number; count: number } | null>('spend', null, async () => {
      const summary = await summarizeTransactions(subject.accountId, today.startIso, today.endIso);
      return { cents: summary.totalExpenseCents, count: summary.count };
    }),
    fallback<string[] | null>('pending', null, async () => (await listOverduePendingTasks(subject.accountId, today.endIso, 10)).map((task) => task.title)),
    fallback<string[]>('habits', [], async () => {
      const [habits, dates] = await Promise.all([listActiveHabits(subject.accountId), listHabitCheckinDates(subject.accountId, todayKey)]);
      return habits.filter((habit) => !computeHabitStats(dates[habit.id] ?? [], todayKey).doneToday).map((habit) => habit.name);
    }),
    fallback<string | null>('tomorrow', null, async () =>
      formatDayOverview(
        await loadDayOverview({
          accountId: subject.accountId,
          timeZone: subject.timeZone,
          quietHoursStart: subject.quietHoursStart,
          quietHoursEnd: subject.quietHoursEnd,
          period: 'tomorrow',
          now,
        }),
      ),
    ),
  ]);

  // Sem tarefas nem gasto lidos, "dia tranquilo" seria chute.
  if (completed === null && spend === null && pending === null) return null;

  const data: DayCloseData = {
    name: subject.name,
    completedTitles: completed ?? [],
    spendCents: spend?.cents ?? 0,
    spendCount: spend?.count ?? 0,
    pendingTitles: pending ?? [],
    habitsMissing,
    tomorrowText: tomorrow,
  };
  return formatDayClose(data);
}

export async function buildWeekReviewMessage(subject: RoutineSubject, now: Date = new Date()): Promise<string | null> {
  const week = getLast7DaysRange(subject.timeZone, now);
  const previous = getPreviousWeekRange(subject.timeZone, now);
  const next = getNext7DaysRange(subject.timeZone, now);
  const weekStartKey = shiftDateKey(localDateKey(subject.timeZone, now), -6);

  const [completed, spend, prevSpend, habitCheckins, overdue, pendingTotal, nextTasks, nextOverview] = await Promise.all([
    fallback<number | null>('completed', null, async () => (await listCompletedTasksBetween(subject.accountId, week.startIso, week.endIso, 200)).length),
    fallback<number | null>('spend', null, async () => (await summarizeTransactions(subject.accountId, week.startIso, week.endIso)).totalExpenseCents),
    fallback<number>('prev_spend', 0, async () => (await summarizeTransactions(subject.accountId, previous.startIso, previous.endIso)).totalExpenseCents),
    fallback<number>('habits', 0, () => countHabitCheckinsSince(subject.accountId, weekStartKey)),
    fallback<number | null>('overdue', null, async () => (await listOverduePendingTasks(subject.accountId, now.toISOString(), 50)).length),
    fallback<number>('pending', 0, async () => (await listTasks(subject.accountId, 'pending', 200)).length),
    fallback<number>('next_tasks', 0, async () => (await listPendingTasksDueBetween(subject.accountId, next.startIso, next.endIso)).length),
    fallback<number>('next_events', 0, async () =>
      (
        await loadDayOverview({
          accountId: subject.accountId,
          timeZone: subject.timeZone,
          quietHoursStart: subject.quietHoursStart,
          quietHoursEnd: subject.quietHoursEnd,
          period: 'week',
          now,
        })
      ).events.length,
    ),
  ]);

  if (completed === null && spend === null && overdue === null) return null;

  const data: WeekReviewData = {
    name: subject.name,
    completedCount: completed ?? 0,
    spendCents: spend ?? 0,
    prevSpendCents: prevSpend,
    habitCheckins,
    pendingCount: pendingTotal,
    overdueCount: overdue ?? 0,
    nextWeekEvents: nextOverview,
    nextWeekTasks: nextTasks,
  };
  return formatWeekReview(data);
}

/** Próxima dica de habilidade que a pessoa ainda não usou nem recebeu; null quando acabaram. */
export async function selectSkillTip(userId: string, accountId: string, now: Date = new Date()): Promise<Skill | null> {
  const since = new Date(now.getTime() - TIP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [used, sent] = await Promise.all([listDistinctToolNamesUsedSince(userId, since), listProactiveRefs(accountId, SKILL_TIP_KIND)]);
  return pickTip(new Set(used), new Set(sent));
}


/**
 * Revisão do mês sob demanda ("revisão do mês"). No dia 1 o mês atual ainda está vazio, então revisa o mês passado inteiro; nos
 * outros dias revisa este mês até ontem e compara com o MESMO trecho do mês passado (nunca um mês parcial contra um inteiro).
 * Null quando nem gasto nem tarefas puderam ser lidos: melhor não responder do que responder "mês vazio" sem saber.
 */
export async function buildMonthReviewMessage(subject: RoutineSubject, now: Date = new Date()): Promise<string | null> {
  const { year, month, day } = datePartsInZone(subject.timeZone, now);
  const reviewingPrevious = day === 1;
  const comparison = reviewingPrevious ? null : getMonthComparisonRanges(subject.timeZone, now);
  const range = reviewingPrevious ? getPreviousMonthRange(subject.timeZone, now) : comparison?.current;
  if (!range) return null;

  const refYear = reviewingPrevious && month === 1 ? year - 1 : year;
  const refMonth = reviewingPrevious ? (month === 1 ? 12 : month - 1) : month;
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(refYear, refMonth - 1, 15)));
  const monthStartKey = `${refYear}-${String(refMonth).padStart(2, '0')}-01`;

  const [summary, compareSummary, completed, habitCheckins, bills] = await Promise.all([
    fallback<Awaited<ReturnType<typeof summarizeTransactions>> | null>('month_spend', null, () => summarizeTransactions(subject.accountId, range.startIso, range.endIso)),
    comparison
      ? fallback<number | null>('month_prev_spend', null, async () => (await summarizeTransactions(subject.accountId, comparison.previous.startIso, comparison.previous.endIso)).totalExpenseCents)
      : Promise.resolve(null),
    fallback<number | null>('month_completed', null, async () => (await listCompletedTasksBetween(subject.accountId, range.startIso, range.endIso, 500)).length),
    // Contagem de hábitos "desde o dia 1" só faz sentido pro mês corrente (não há limite superior); no passado fica de fora.
    reviewingPrevious ? Promise.resolve(null) : fallback<number | null>('month_habits', null, () => countHabitCheckinsSince(subject.accountId, monthStartKey)),
    fallback<Array<{ amount_cents: number }>>('month_bills', [], () => listActiveRecurringBills(subject.accountId)),
  ]);

  if (summary === null && completed === null) return null;

  const data: MonthReviewData = {
    name: subject.name,
    period: reviewingPrevious ? 'previous' : 'current',
    monthLabel,
    expenseCents: summary?.totalExpenseCents ?? 0,
    incomeCents: summary?.totalIncomeCents ?? 0,
    compareExpenseCents: compareSummary,
    topCategories: Object.entries(summary?.byCategory ?? {})
      .map(([category, cents]) => ({ category, cents }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 3),
    completedTasks: completed,
    habitCheckins,
    billsCount: bills.length,
    billsTotalCents: bills.reduce((sum, bill) => sum + bill.amount_cents, 0),
  };
  return formatMonthReview(data);
}

const UPCOMING_DATE_WINDOW_DAYS = 3;

/** Sugestões do comando "sugestão", só com o que deu pra ler: fonte que falhou vira null e a sugestão correspondente não sai. */
export async function buildSuggestionMessage(subject: RoutineSubject, now: Date = new Date()): Promise<string> {
  const todayKey = localDateKey(subject.timeZone, now);
  const comparison = getMonthComparisonRanges(subject.timeZone, now);

  const [overdue, pendingTasks, habitsMissing, hasGoals, hasBills, hasReminders, upcomingDate, spendChange] = await Promise.all([
    fallback<number | null>('suggest_overdue', null, async () => (await listOverduePendingTasks(subject.accountId, now.toISOString(), 50)).length),
    fallback<number | null>('suggest_undated', null, async () => (await listTasks(subject.accountId, 'pending', 200)).filter((task) => task.due_at === null).length),
    fallback<string[] | null>('suggest_habits', null, async () => {
      const [habits, dates] = await Promise.all([listActiveHabits(subject.accountId), listHabitCheckinDates(subject.accountId, todayKey)]);
      return habits.filter((habit) => !computeHabitStats(dates[habit.id] ?? [], todayKey).doneToday).map((habit) => habit.name);
    }),
    fallback<boolean | null>('suggest_goals', null, async () => {
      const [savings, personal] = await Promise.all([listGoals(subject.accountId, 'active'), listPersonalGoals(subject.accountId, 'pending', 1)]);
      return savings.length + personal.length > 0;
    }),
    fallback<boolean | null>('suggest_bills', null, async () => (await listActiveRecurringBills(subject.accountId)).length > 0),
    fallback<boolean | null>('suggest_reminders', null, async () => (await listPendingReminders(subject.accountId, 1)).length > 0),
    fallback<{ label: string; days: number } | null>('suggest_dates', null, async () => {
      const dates = await listImportantDates(subject.accountId, 200);
      const soonest = dates
        .map((date) => ({ label: date.label, days: daysUntilNextOccurrence(date.month, date.day, subject.timeZone, now) }))
        .filter((date) => date.days <= UPCOMING_DATE_WINDOW_DAYS)
        .sort((a, b) => a.days - b.days)[0];
      return soonest ?? null;
    }),
    comparison
      ? fallback<number | null>('suggest_spend', null, async () => {
          const [current, previous] = await Promise.all([
            summarizeTransactions(subject.accountId, comparison.current.startIso, comparison.current.endIso),
            summarizeTransactions(subject.accountId, comparison.previous.startIso, comparison.previous.endIso),
          ]);
          // Só com as duas bases > 0: mês anterior em branco costuma ser "não registrei".
          return current.totalExpenseCents > 0 && previous.totalExpenseCents > 0 ? percentChange(previous.totalExpenseCents, current.totalExpenseCents) : null;
        })
      : Promise.resolve(null),
  ]);

  const signals: SuggestionSignals = {
    overdueCount: overdue,
    undatedPendingCount: pendingTasks,
    habitsMissingToday: habitsMissing,
    hasGoals,
    hasBills,
    hasReminders,
    upcomingDate,
    spendChangePercent: spendChange,
  };
  return formatSuggestions(pickSuggestions(signals));
}
