import {
  claimProactiveMessage,
  countProactiveMessagesSince,
  listPendingTasksDueBetween,
  listProactiveRefs,
  listSuccessfulToolCallsSince,
  markTaskFollowUpAsked,
  logger,
  type AccountOwnerForSweep,
} from '@zapbuddy/db';
import {
  CHECKIN_DAILY_CAP,
  CHECKIN_FIRST_HOUR,
  CHECKIN_LAST_HOUR,
  CHECKIN_MAX_AFTER_MINUTES,
  CHECKIN_MIN_AFTER_MINUTES,
  SKILL_TIP_KIND,
  appendTurns,
  buildDayCloseMessage,
  buildWeekReviewMessage,
  deliverReply,
  eventsFromToolLogs,
  formatCheckinMessage,
  formatSkillTip,
  getLocalDateParts,
  getLocalWeekday,
  getTodayRange,
  pickCheckinCandidate,
  selectSkillTip,
  type RoutineSubject,
} from '@zapbuddy/core';

/**
 * Rotinas proativas dentro do sweep horário (sem fila nova — ver a análise de
 * consumo de Redis no CLAUDE.md): check-in "como foi?", fechamento do dia,
 * revisão da semana e dica semanal de habilidade. Cada uma é idempotente por
 * `proactive_message_logs` (o INSERT é a trava), respeita o horário de
 * silêncio e é opt-out (check-ins e dica) ou opt-in (fechamento e revisão).
 */

const DAY_CLOSE_LOCAL_HOUR = 20;
const WEEK_REVIEW_LOCAL_HOUR = 18;
const WEEK_REVIEW_LOCAL_WEEKDAY = 0; // domingo
const TIP_LOCAL_HOUR = 11;
const TIP_LOCAL_WEEKDAY = 3; // quarta
const TIP_MIN_DAYS_OF_USE = 3;
const TIP_MIN_GAP_DAYS = 6;
const EVENT_LOG_LOOKBACK_DAYS = 3;

const KIND_CHECKIN = 'checkin';
const KIND_DAY_CLOSE = 'day_close';
const KIND_WEEK_REVIEW = 'week_review';

export interface RoutineTick {
  localHour: number;
  quiet: boolean;
}

function dateKey(timeZone: string): string {
  const { year, month, day } = getLocalDateParts(timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Manda a mensagem e deixa o Tom saber disso na conversa (pra "sim"/"remarca" da pessoa fazerem sentido). */
async function sendProactive(account: AccountOwnerForSweep, text: string): Promise<void> {
  await deliverReply({ to: account.ownerWhatsappNumber, waMessageId: null, reply: { text } });
  await appendTurns(account.ownerWhatsappNumber, [{ role: 'assistant', content: text, at: new Date().toISOString() }]).catch((error) => {
    logger.warn('proactive_history_append_failed', { accountId: account.accountId, error: error instanceof Error ? error.message : String(error) });
  });
}

function subjectOf(account: AccountOwnerForSweep): RoutineSubject {
  return {
    accountId: account.accountId,
    timeZone: account.ownerTimezone,
    quietHoursStart: account.quietHoursStart,
    quietHoursEnd: account.quietHoursEnd,
    name: account.displayName,
  };
}

async function runCheckin(account: AccountOwnerForSweep, tick: RoutineTick, now: Date): Promise<void> {
  if (!account.routineCheckins || tick.quiet) return;
  if (tick.localHour < CHECKIN_FIRST_HOUR || tick.localHour > CHECKIN_LAST_HOUR) return;

  const today = getTodayRange(account.ownerTimezone, now);
  if ((await countProactiveMessagesSince(account.accountId, KIND_CHECKIN, today.startIso)) >= CHECKIN_DAILY_CAP) return;

  const nowMs = now.getTime();
  const [tasks, logs, askedRefs] = await Promise.all([
    listPendingTasksDueBetween(
      account.accountId,
      new Date(nowMs - CHECKIN_MAX_AFTER_MINUTES * 60_000).toISOString(),
      new Date(nowMs - CHECKIN_MIN_AFTER_MINUTES * 60_000).toISOString(),
    ),
    listSuccessfulToolCallsSince(
      account.ownerUserId,
      ['create_calendar_event', 'update_calendar_event', 'delete_calendar_event'],
      new Date(nowMs - EVENT_LOG_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      300,
    ),
    listProactiveRefs(account.accountId, KIND_CHECKIN),
  ]);

  const candidate = pickCheckinCandidate(
    eventsFromToolLogs(logs),
    tasks.filter((task) => task.due_at).map((task) => ({ id: task.id, title: task.title, dueIso: task.due_at! })),
    nowMs,
    new Set(askedRefs),
    account.ownerTimezone,
  );
  if (!candidate) return;

  if (!(await claimProactiveMessage(account.accountId, KIND_CHECKIN, candidate.ref))) return;
  await sendProactive(account, formatCheckinMessage(candidate));
  // O resumo da manhã também pergunta de tarefa atrasada: marcar evita a pergunta repetida amanhã.
  if (candidate.kind === 'task') await markTaskFollowUpAsked(account.accountId, candidate.taskId);
}

async function runDayClose(account: AccountOwnerForSweep, tick: RoutineTick): Promise<void> {
  if (!account.routineDayClose || tick.quiet || tick.localHour !== DAY_CLOSE_LOCAL_HOUR) return;
  if (!(await claimProactiveMessage(account.accountId, KIND_DAY_CLOSE, dateKey(account.ownerTimezone)))) return;
  const message = await buildDayCloseMessage(subjectOf(account));
  if (message) await sendProactive(account, message);
}

async function runWeekReview(account: AccountOwnerForSweep, tick: RoutineTick): Promise<void> {
  if (!account.routineWeekReview || tick.quiet || tick.localHour !== WEEK_REVIEW_LOCAL_HOUR) return;
  if (getLocalWeekday(account.ownerTimezone) !== WEEK_REVIEW_LOCAL_WEEKDAY) return;
  if (!(await claimProactiveMessage(account.accountId, KIND_WEEK_REVIEW, dateKey(account.ownerTimezone)))) return;
  const message = await buildWeekReviewMessage(subjectOf(account));
  if (message) await sendProactive(account, message);
}

async function runSkillTip(account: AccountOwnerForSweep, tick: RoutineTick, now: Date): Promise<void> {
  if (!account.routineWeeklyTip || tick.quiet || tick.localHour !== TIP_LOCAL_HOUR) return;
  if (getLocalWeekday(account.ownerTimezone) !== TIP_LOCAL_WEEKDAY) return;
  // Só depois dos primeiros dias de uso: o onboarding e o resumo da manhã já ensinam o básico.
  if (now.getTime() - new Date(account.userCreatedAt).getTime() < TIP_MIN_DAYS_OF_USE * 24 * 60 * 60 * 1000) return;

  const since = new Date(now.getTime() - TIP_MIN_GAP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  if ((await countProactiveMessagesSince(account.accountId, SKILL_TIP_KIND, since)) > 0) return;

  const skill = await selectSkillTip(account.ownerUserId, account.accountId, now);
  if (!skill) return;
  if (!(await claimProactiveMessage(account.accountId, SKILL_TIP_KIND, skill.id))) return;
  await sendProactive(account, formatSkillTip(skill));
}

/** Chamado por conta no sweep horário; cada rotina isolada, nenhuma derruba as outras nem o resto do sweep. */
export async function runProactiveRoutines(account: AccountOwnerForSweep, tick: RoutineTick): Promise<void> {
  const now = new Date();
  const routines: Array<[string, () => Promise<void>]> = [
    ['checkin', () => runCheckin(account, tick, now)],
    ['day_close', () => runDayClose(account, tick)],
    ['week_review', () => runWeekReview(account, tick)],
    ['skill_tip', () => runSkillTip(account, tick, now)],
  ];
  for (const [name, run] of routines) {
    try {
      await run();
    } catch (error) {
      logger.error('proactive_routine_failed', { routine: name, accountId: account.accountId, error: error instanceof Error ? error.message : String(error) });
    }
  }
}
