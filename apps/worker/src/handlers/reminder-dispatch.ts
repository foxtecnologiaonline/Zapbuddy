import type { Job } from 'bullmq';
import { findUserById, findPendingReminderById, markReminderSent, createReminder } from '@zapbuddy/db';
import {
  sendWhatsappTextMessage,
  hasReminderBeenDispatched,
  markReminderDispatched,
  computeNextOccurrence,
  getReminderDispatchQueue,
  MESSAGES,
  type ReminderDispatchJob,
} from '@zapbuddy/core';

/**
 * Limitação conhecida da WhatsApp Cloud API (não corrigível em código): fora
 * da janela de 24h desde a última mensagem do usuário, a Meta só aceita
 * mensagens de *template* pré-aprovado — texto livre como este é rejeitado.
 * Se o lembrete for agendado pra mais de 24h depois da última interação, o
 * envio pode falhar por esse motivo. Isso propaga como erro normal; o
 * retry (DEFAULT_JOB_OPTIONS) tenta de novo, e se esgotar, worker.ts marca
 * o lembrete como 'failed' em vez de deixá-lo preso em 'pending'. Resolver
 * de verdade exige criar e submeter um template de lembrete pra aprovação
 * da Meta — fora do escopo de código.
 */
export async function handleReminderDispatch(job: Job<ReminderDispatchJob>): Promise<void> {
  const { reminderId } = job.data;

  const reminder = await findPendingReminderById(reminderId);
  if (!reminder) return; // já enviado ou cancelado

  const user = await findUserById(reminder.user_id);
  if (!user) return;

  // Idempotência: se o envio já teve sucesso numa tentativa anterior e só o
  // markReminderSent() seguinte falhou, não manda a notificação de novo —
  // só tenta marcar como enviado de novo (idempotente, seguro de repetir).
  if (!(await hasReminderBeenDispatched(reminder.id))) {
    await sendWhatsappTextMessage(user.whatsapp_number, MESSAGES.reminder(reminder.message));
    await markReminderDispatched(reminder.id);
  }
  await markReminderSent(reminder.id);

  // Lembrete recorrente: a ocorrência atual só marca 'sent' (nunca
  // reaproveitada) — a próxima é uma linha nova, com seu próprio id/job,
  // igual um lembrete comum (cancelável, consultável sozinha). Encadeia
  // indefinidamente: cada disparo agenda o seguinte.
  if (reminder.recurrence) {
    const nextRemindAt = computeNextOccurrence(reminder.remind_at, reminder.recurrence);
    const next = await createReminder(
      reminder.account_id,
      reminder.user_id,
      reminder.message,
      nextRemindAt,
      reminder.task_id ?? undefined,
      reminder.recurrence,
    );
    const delay = Math.max(0, new Date(nextRemindAt).getTime() - Date.now());
    await getReminderDispatchQueue().add('dispatch', { reminderId: next.id }, { delay, jobId: next.id });
  }
}
