import type { Job } from 'bullmq';
import { listActiveRecurringBills, listTasks, markTaskFollowUpAsked, logger, type Task } from '@zapbuddy/db';
import {
  billsDueWithin,
  datePartsInZone,
  daysOverdue,
  formatMorningDigest,
  getTodayAgendaLines,
  getTodayRange,
  sendWhatsappTextMessage,
  type MorningDigestGenerateJob,
  type OverdueTaskFollowUp,
} from '@zapbuddy/core';

/**
 * Resumo matinal: agenda do dia, tarefas de hoje (e atrasadas) e contas a
 * vencer nos próximos dias — uma mensagem só. Se a agenda do Google falhar,
 * manda o resto mesmo assim: o resumo não deve sumir por causa de uma
 * integração externa. Sem nada pra mostrar, não manda nada.
 */
export async function handleMorningDigestGenerate(job: Job<MorningDigestGenerateJob>): Promise<void> {
  const { accountId, ownerWhatsappNumber, ownerTimezone } = job.data;

  const agendaLines = await getTodayAgendaLines(accountId, ownerTimezone).catch((error) => {
    logger.error('morning_digest_agenda_failed', { accountId, error: error instanceof Error ? error.message : String(error) });
    return [] as string[];
  });

  const today = getTodayRange(ownerTimezone);
  const { year, month, day } = datePartsInZone(ownerTimezone, new Date());

  const pendingTasks = await listTasks(accountId, 'pending');
  const taskTitles: string[] = [];
  const followUpTasks: OverdueTaskFollowUp[] = [];
  const tasksToMarkAsked: Task[] = [];

  for (const task of pendingTasks) {
    if (task.due_at === null || task.due_at > today.endIso) continue;

    if (task.due_at < today.startIso && task.follow_up_asked_at === null) {
      const due = datePartsInZone(ownerTimezone, new Date(task.due_at));
      followUpTasks.push({ title: task.title, daysOverdue: daysOverdue(due.year, due.month, due.day, year, month, day) });
      tasksToMarkAsked.push(task);
    } else {
      taskTitles.push(task.title);
    }
  }

  const bills = billsDueWithin(
    (await listActiveRecurringBills(accountId)).map((bill) => ({
      name: bill.name,
      amountCents: bill.amount_cents,
      dueDay: bill.due_day,
    })),
    year,
    month,
    day,
  );

  const message = formatMorningDigest({ agendaLines, taskTitles, followUpTasks, bills });
  if (message === null) return;

  await sendWhatsappTextMessage(ownerWhatsappNumber, message);
  await Promise.all(tasksToMarkAsked.map((task) => markTaskFollowUpAsked(accountId, task.id)));
}
