import type { Job } from 'bullmq';
import { logImportantDateReminder } from '@zapbuddy/db';
import { sendWhatsappTextMessage, recordProactiveMessage, formatImportantDateReminderMessage, type ImportantDateReminderJob } from '@zapbuddy/core';

/**
 * Manda o lembrete anual pro dono da conta e loga (idempotência — ver
 * important_date_logs). Quem decide SE deve chamar (hora local certa +
 * ainda não enviado esse ano) é o insights-sweep.ts.
 */
export async function handleImportantDateReminder(job: Job<ImportantDateReminderJob>): Promise<void> {
  const { importantDateId, label, ownerWhatsappNumber, year } = job.data;

  const text = formatImportantDateReminderMessage(label);
  await sendWhatsappTextMessage(ownerWhatsappNumber, text);
  await recordProactiveMessage(ownerWhatsappNumber, text);
  await logImportantDateReminder(importantDateId, year);
}
