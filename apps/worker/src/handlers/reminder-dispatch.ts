import type { Job } from 'bullmq';
import { findUserById, findPendingReminderById, markReminderSent } from '@zapbuddy/db';
import { sendWhatsappTextMessage, type ReminderDispatchJob } from '@zapbuddy/core';

export async function handleReminderDispatch(job: Job<ReminderDispatchJob>): Promise<void> {
  const { reminderId } = job.data;

  const reminder = await findPendingReminderById(reminderId);
  if (!reminder) return; // já enviado ou cancelado

  const user = await findUserById(reminder.user_id);
  if (!user) return;

  await sendWhatsappTextMessage(user.whatsapp_number, `⏰ Lembrete: ${reminder.message}`);
  await markReminderSent(reminder.id);
}
