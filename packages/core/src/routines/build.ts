import {
  countHabitCheckinsSince,
  listActiveHabits,
  listCompletedTasksBetween,
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
import { getLast7DaysRange, getNext7DaysRange, getPreviousWeekRange, getTodayRange } from '../time/zoned-ranges.js';
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

