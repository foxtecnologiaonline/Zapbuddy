import type { Job } from 'bullmq';
import { findUserById, findPendingReminderById, markReminderSent } from '@zapbuddy/db';
import {
  sendWhatsappTextMessage,
  hasReminderBeenDispatched,
  markReminderDispatched,
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
    await sendWhatsappTextMessage(user.whatsapp_number, `⏰ Lembrete: ${reminder.message}`);
    await markReminderDispatched(reminder.id);
  }
  await markReminderSent(reminder.id);
}
