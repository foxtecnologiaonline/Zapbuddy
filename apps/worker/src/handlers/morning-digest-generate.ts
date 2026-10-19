import type { Job } from 'bullmq';
import { listActiveRecurringBills, listTasks, logger } from '@zapbuddy/db';
import {
  billsDueWithin,
  datePartsInZone,
  formatMorningDigest,
  getTodayAgendaLines,
  getTodayRange,
  sendWhatsappTextMessage,
  type MorningDigestGenerateJob,
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
  const pendingTasks = await listTasks(accountId, 'pending');
  const taskTitles = pendingTasks
    .filter((task) => task.due_at !== null && task.due_at <= today.endIso)
    .map((task) => task.title);

  const { year, month, day } = datePartsInZone(ownerTimezone, new Date());
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

  const message = formatMorningDigest({ agendaLines, taskTitles, bills });
  if (message === null) return;

  await sendWhatsappTextMessage(ownerWhatsappNumber, message);
}
