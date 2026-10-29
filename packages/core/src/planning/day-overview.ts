import {
  listActiveHabits,
  listHabitCheckinDates,
  listOverduePendingTasks,
  listPendingReminders,
  listPendingTasksDueBetween,
  listUndatedPendingTasks,
  logger,
} from '@zapbuddy/db';
import { getFreshCalendarAccess, listCalendarEvents } from '../calendar/calendar-access.js';
import { computeHabitStats, localDateKey } from '../habits/streak.js';
import { datePartsInZone, getNext7DaysRange, getTodayRange, getTomorrowRange, zonedWallTimeToUtc } from '../time/zoned-ranges.js';
import { computeFreeWindows, type BusyBlock } from './free-windows.js';
import type { DayOverviewData, OverviewEvent, OverviewFreeWindow, OverviewPeriod, OverviewReminder, OverviewTask } from './day-format.js';

export interface DayOverviewInput {
  accountId: string;
  timeZone: string;
  quietHoursStart: number;
  quietHoursEnd: number;
  period: OverviewPeriod;
  now?: Date;
}

const DEFAULT_WAKE_HOUR = 7;
const DEFAULT_SLEEP_HOUR = 22;
const TIMED_TASK_BLOCK_MINUTES = 30;
const UNDATED_SHOWN = 5;

async function safely<T>(source: string, failed: string[], fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    failed.push(source);
    logger.warn('day_overview_source_failed', { source, error: error instanceof Error ? error.message : String(error) });
    return fallback;
  }
}

/**
 * Janela em que a pessoa está acordada, derivada do horário de silêncio dela
 * (fim do silêncio = acordar, início = dormir). Silêncio que não cruza a
 * meia-noite ou desligado cai no padrão 7h-22h — melhor que sugerir 3h da manhã.
 */
export function awakeHours(quietStart: number, quietEnd: number): { wake: number; sleep: number } {
  if (quietStart > quietEnd) return { wake: quietEnd, sleep: quietStart };
  return { wake: DEFAULT_WAKE_HOUR, sleep: DEFAULT_SLEEP_HOUR };
}

function isTimedIso(iso: string): boolean {
  return iso.includes('T');
}

export async function loadDayOverview(input: DayOverviewInput): Promise<DayOverviewData> {
  const now = input.now ?? new Date();
  const { timeZone, accountId, period } = input;
  const range = period === 'today' ? getTodayRange(timeZone, now) : period === 'tomorrow' ? getTomorrowRange(timeZone, now) : getNext7DaysRange(timeZone, now);
  const failed: string[] = [];

  const [calendar, tasks, reminders, overdue, undated, habits] = await Promise.all([
    safely<{ connected: boolean; events: OverviewEvent[] }>('agenda', failed, { connected: false, events: [] }, async () => {
      const access = await getFreshCalendarAccess(accountId);
      if (!access) return { connected: false, events: [] };
      const events = await listCalendarEvents(access, range.startIso, range.endIso);
      return {
        connected: true,
        events: events.map((event) => ({ title: event.summary, startIso: event.startIso, endIso: event.endIso })).sort((a, b) => a.startIso.localeCompare(b.startIso)),
      };
    }),
    safely<OverviewTask[]>('tarefas', failed, [], async () =>
      (await listPendingTasksDueBetween(accountId, range.startIso, range.endIso)).map((task) => ({ id: task.id, title: task.title, dueIso: task.due_at })),
    ),
    safely<OverviewReminder[]>('lembretes', failed, [], async () =>
      (await listPendingReminders(accountId, 50))
        .filter((reminder) => reminder.remind_at >= range.startIso && reminder.remind_at <= range.endIso)
        .map((reminder) => ({ message: reminder.message, atIso: reminder.remind_at })),
    ),
    period === 'today'
      ? safely<OverviewTask[]>('tarefas', failed, [], async () =>
          (await listOverduePendingTasks(accountId, range.startIso, 8)).map((task) => ({ id: task.id, title: task.title, dueIso: task.due_at })),
        )
      : Promise.resolve<OverviewTask[]>([]),
    period !== 'week'
      ? safely<OverviewTask[]>('tarefas', failed, [], async () =>
          (await listUndatedPendingTasks(accountId, UNDATED_SHOWN + 1)).map((task) => ({ id: task.id, title: task.title, dueIso: null })),
        )
      : Promise.resolve<OverviewTask[]>([]),
    period === 'today'
      ? safely<string[]>('habitos', failed, [], async () => {
          const todayKey = localDateKey(timeZone, now);
          const [activeHabits, datesByHabit] = await Promise.all([listActiveHabits(accountId), listHabitCheckinDates(accountId, todayKey)]);
          return activeHabits.filter((habit) => !computeHabitStats(datesByHabit[habit.id] ?? [], todayKey).doneToday).map((habit) => habit.name);
        })
      : Promise.resolve<string[]>([]),
  ]);

  const uniqueFailed = [...new Set(failed)];

  let freeWindows: OverviewFreeWindow[] = [];
  if (period !== 'week' && uniqueFailed.length === 0) {
    const { wake, sleep } = awakeHours(input.quietHoursStart, input.quietHoursEnd);
    const day = datePartsInZone(timeZone, new Date(range.startIso));
    const wakeMs = zonedWallTimeToUtc(day.year, day.month, day.day, wake, 0, 0, timeZone).getTime();
    const sleepMs = zonedWallTimeToUtc(day.year, day.month, day.day, sleep, 0, 0, timeZone).getTime();
    const fromMs = Math.max(wakeMs, now.getTime());

    const busy: BusyBlock[] = [];
    for (const event of calendar.events) {
      if (!isTimedIso(event.startIso)) continue; // dia inteiro não bloqueia horário
      const startMs = new Date(event.startIso).getTime();
      const endMs = isTimedIso(event.endIso) ? new Date(event.endIso).getTime() : startMs + 60 * 60_000;
      busy.push({ startMs, endMs });
    }
    for (const task of tasks) {
      if (!task.dueIso) continue;
      const hour = new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(task.dueIso));
      if (hour === '00:00' || hour === '23:59') continue;
      const startMs = new Date(task.dueIso).getTime();
      busy.push({ startMs, endMs: startMs + TIMED_TASK_BLOCK_MINUTES * 60_000 });
    }
    freeWindows = computeFreeWindows(busy, fromMs, sleepMs, 30).map((window) => ({
      startIso: new Date(window.startMs).toISOString(),
      endIso: new Date(window.endMs).toISOString(),
      minutes: window.minutes,
    }));
  }

  return {
    period,
    timeZone,
    nowIso: now.toISOString(),
    calendarConnected: calendar.connected,
    events: calendar.events,
    tasksDue: tasks,
    reminders,
    overdue,
    undated: undated.slice(0, UNDATED_SHOWN),
    undatedMore: undated.length > UNDATED_SHOWN,
    habitsPending: habits,
    freeWindows,
    failedSources: uniqueFailed,
  };
}
