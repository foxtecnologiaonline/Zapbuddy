import type { Job } from 'bullmq';
import {
  inferLocationFromWhatsappNumber,
  listActiveRecurringBills,
  listOverdueTasksAwaitingFollowUp,
  listPendingTasksDueBetween,
  logImportantDateReminder,
  logger,
  markTaskFollowUpAsked,
} from '@zapbuddy/db';
import {
  billsDueWithin,
  composeMorningDigest,
  datePartsInZone,
  daysOverdue,
  describeHolidayToday,
  estacaoDoAno,
  formatMorningExtras,
  formatTaskFollowUpMessage,
  getTodayAndTomorrowAgendaEvents,
  getTodayRange,
  getTomorrowRange,
  getTodayWeatherSummary,
  sendWhatsappTextMessage,
  type MorningDigestGenerateJob,
  type TodayAndTomorrowAgenda,
} from '@zapbuddy/core';
import { loadMorningExtras } from './morning-digest-extras.js';

// Mensagens seguidas no WhatsApp podem chegar fora de ordem; uma pausa curta
// garante 1-2-3 e dá cara de "alguém digitando".
const GAP_BETWEEN_MESSAGES_MS = 1_500;
const DEFAULT_DIGEST_HOUR = 8;
const NO_AGENDA: TodayAndTomorrowAgenda = { today: [], tomorrow: [] };

/** O aviso das 9h pula datas já avisadas no ano (idempotência de important_date_logs) — marcar aqui evita a mensagem repetida. Best-effort. */
async function markTodayDatesAsReminded(ids: string[], year: number): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      logImportantDateReminder(id, year).catch((error) =>
        logger.error('morning_digest_date_log_failed', { importantDateId: id, error: describeError(error) }),
      ),
    ),
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resumo matinal: narrativa (sempre) + agenda/tarefas de hoje + contas que
 * vencem hoje (só se houver) — montagem em `composeMorningDigest`, aqui só IO.
 * Localização: cidade informada pela pessoa (set_city) ou, sem ela, a
 * aproximação pelo DDD (`location-from-ddd.ts`). Tudo que o resumo precisa é
 * buscado em paralelo, cada fonte com fallback próprio: clima, agenda,
 * tarefas ou contas fora do ar nunca derrubam o resto nem inventam dado.
 *
 * Só o envio da narrativa propaga erro (nada foi mandado ainda, re-tentar o
 * job é seguro). Se um envio posterior falhar, loga e segue: propagar faria o
 * BullMQ (`attempts: 3`) re-tentar o job inteiro e reenviar a narrativa já
 * entregue como duplicata.
 */
export async function handleMorningDigestGenerate(job: Job<MorningDigestGenerateJob>): Promise<void> {
  const { accountId, ownerWhatsappNumber, ownerTimezone } = job.data;
  const includeAgenda = job.data.includeAgenda ?? true;
  const includeFinance = job.data.includeFinance ?? true;

  const now = new Date();
  const { year, month, day } = datePartsInZone(ownerTimezone, now);
  const fallbackLocation = inferLocationFromWhatsappNumber(ownerWhatsappNumber);
  const location = job.data.city ?? fallbackLocation;
  const today = getTodayRange(ownerTimezone);

  const failedSources = new Set<string>();
  const safely = async <T>(source: string, run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      failedSources.add(source);
      logger.error('morning_digest_source_failed', { accountId, source, error: describeError(error) });
      return fallback;
    }
  };

  // Tudo em paralelo: agenda de hoje+amanhã numa chamada só (o token da agenda é renovado a cada uso),
  // tarefas de hoje+amanhã numa consulta só, e as informações extras junto das demais fontes.
  const tomorrow = getTomorrowRange(ownerTimezone, now);
  const [weather, agenda, tasksWindow, overdueTasks, recurringBills, loadedExtras] = await Promise.all([
    safely('weather', () => getTodayWeatherSummary({ latitude: location.latitude, longitude: location.longitude, timezone: ownerTimezone }), null),
    includeAgenda ? safely('agenda', () => getTodayAndTomorrowAgendaEvents(accountId, ownerTimezone, now), NO_AGENDA) : Promise.resolve(NO_AGENDA),
    includeAgenda ? safely('tasks', () => listPendingTasksDueBetween(accountId, today.startIso, tomorrow.endIso), []) : Promise.resolve([]),
    includeAgenda ? safely('overdue_tasks', () => listOverdueTasksAwaitingFollowUp(accountId, today.startIso), []) : Promise.resolve([]),
    includeFinance ? safely('bills', () => listActiveRecurringBills(accountId), []) : Promise.resolve([]),
    loadMorningExtras({ accountId, timezone: ownerTimezone, now, year, month, day, includeAgenda, includeFinance, safely }),
  ]);

  // due_at do Supabase vem como "+00:00", não "Z" — compara instantes, não texto.
  const todayEndMs = new Date(today.endIso).getTime();
  const tasksDueToday = tasksWindow.filter((task) => task.due_at !== null && new Date(task.due_at).getTime() <= todayEndMs);
  const tasksDueTomorrow = tasksWindow.filter((task) => task.due_at !== null && new Date(task.due_at).getTime() > todayEndMs);
  const agendaEvents = agenda.today;

  const { todayDates } = loadedExtras;
  const extras = {
    ...loadedExtras.extras,
    tomorrow: includeAgenda
      ? { events: agenda.tomorrow, tasks: tasksDueTomorrow.map((task) => ({ title: task.title })), weather: weather?.tomorrow ?? null }
      : null,
  };
  const extrasText = formatMorningExtras(extras, ownerTimezone);

  const bills = billsDueWithin(
    recurringBills.map((bill) => ({ name: bill.name, amountCents: bill.amount_cents, dueDay: bill.due_day })),
    year,
    month,
    day,
  );

  const holiday = describeHolidayToday(location.uf, year, month, day);
  const messages = composeMorningDigest({
    name: job.data.displayName ?? null,
    timezone: ownerTimezone,
    digestHour: job.data.digestHour ?? DEFAULT_DIGEST_HOUR,
    nowMs: now.getTime(),
    month,
    day,
    season: estacaoDoAno(month, day),
    weather,
    holiday,
    agendaEvents,
    tasks: tasksDueToday.map((task) => ({ title: task.title, dueAtIso: task.due_at })),
    bills,
    includeAgenda,
    includeFinance,
    // Clima fora do ar não muda o que está agendado; falha de agenda/tarefas/contas sim ("vazio" ali pode ser mentira).
    dataComplete: !['agenda', 'tasks', 'bills'].some((source) => failedSources.has(source)),
    extras,
  });

  await sendWhatsappTextMessage(ownerWhatsappNumber, messages[0]!);

  let delivered = 1;
  for (const message of messages.slice(1)) {
    try {
      await new Promise((resolve) => setTimeout(resolve, GAP_BETWEEN_MESSAGES_MS));
      await sendWhatsappTextMessage(ownerWhatsappNumber, message);
      delivered += 1;
      if (message === extrasText) await markTodayDatesAsReminded(todayDates.map((item) => item.id), year);
    } catch (error) {
      logger.error('morning_digest_message_failed', { accountId, error: describeError(error) });
    }
  }

  // Pergunta de conclusão: mensagem à parte, e só marca como perguntada DEPOIS
  // de entregue — se o envio falhar, a pergunta tenta de novo no próximo dia.
  const followUps = overdueTasks.map((task) => {
    const due = datePartsInZone(ownerTimezone, new Date(task.due_at!));
    return { task, view: { title: task.title, daysOverdue: daysOverdue(due.year, due.month, due.day, year, month, day) } };
  });
  const followUpMessage = formatTaskFollowUpMessage(followUps.map((item) => item.view));
  if (followUpMessage !== null) {
    try {
      await new Promise((resolve) => setTimeout(resolve, GAP_BETWEEN_MESSAGES_MS));
      await sendWhatsappTextMessage(ownerWhatsappNumber, followUpMessage);
      delivered += 1;
      await Promise.all(followUps.map((item) => markTaskFollowUpAsked(accountId, item.task.id)));
    } catch (error) {
      logger.error('morning_digest_followup_failed', { accountId, error: describeError(error) });
    }
  }

  logger.info('morning_digest_sent', {
    accountId,
    messages: delivered,
    weather: weather !== null,
    holiday: holiday?.name ?? null,
    agendaEvents: agendaEvents.length,
    tasks: tasksDueToday.length,
    followUps: followUps.length,
    extras: extrasText !== null,
    bills: bills.length,
    cityKnown: job.data.city != null,
  });
}
