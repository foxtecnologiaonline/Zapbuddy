import type { Job } from 'bullmq';
import { findUserById, findPendingReminderById, markReminderSent, createReminder, listPendingReminders, type Reminder } from '@zapbuddy/db';
import {
  sendWhatsappReminder,
  hasReminderBeenDispatched,
  markReminderDispatched,
  recordProactiveMessage,
  computeNextOccurrence,
  getReminderDispatchQueue,
  MESSAGES,
  type ReminderDispatchJob,
} from '@zapbuddy/core';

const STALE_JOB_TOLERANCE_MS = 60_000;

/**
 * Janela de 24h da WhatsApp Cloud API: fora dela (desde a última mensagem da pessoa) a Meta recusa texto livre (erro 131047) e só aceita
 * *template* pré-aprovado. `sendWhatsappReminder` tenta o texto e, se a Meta recusar por janela fechada, manda o template configurado em
 * WHATSAPP_REMINDER_TEMPLATE_NAME com a mensagem do lembrete como parâmetro (texto exato pra criar na Meta: deploy/worker/README.md).
 * SEM template configurado o comportamento é o de antes: propaga como erro normal; o retry (DEFAULT_JOB_OPTIONS) tenta de novo e, se
 * esgotar, worker.ts marca o lembrete como 'failed' em vez de deixá-lo preso em 'pending'. O log `reminder_window_closed_no_template`
 * diz o que configurar.
 */
export async function handleReminderDispatch(job: Job<ReminderDispatchJob>): Promise<void> {
  const { reminderId } = job.data;

  const reminder = await findPendingReminderById(reminderId);
  if (!reminder) return; // já enviado ou cancelado

  // Job velho de um lembrete que foi remarcado (update_reminder): o horário
  // novo é no futuro e já tem seu próprio job — este só chegou antes da hora.
  if (new Date(reminder.remind_at).getTime() - Date.now() > STALE_JOB_TOLERANCE_MS) return;

  const user = await findUserById(reminder.user_id);
  if (!user) return;

  // Idempotência: se o envio já teve sucesso numa tentativa anterior e só o
  // markReminderSent() seguinte falhou, não manda a notificação de novo —
  // só tenta marcar como enviado de novo (idempotente, seguro de repetir).
  if (!(await hasReminderBeenDispatched(reminder.id))) {
    const text = MESSAGES.reminder(reminder.message);
    // Texto livre dentro da janela de 24h; fora dela, o template configurado (se houver) leva a mensagem do lembrete.
    await sendWhatsappReminder(user.whatsapp_number, text, reminder.message);
    await markReminderDispatched(reminder.id);
    // Depois da marca de "já disparado": um retry não registra em dobro. Sem isso, "adia pra amanhã" respondendo ao lembrete
    // chegava ao LLM sem saber de qual lembrete a pessoa falava.
    await recordProactiveMessage(user.whatsapp_number, text);
  }

  // Lembrete recorrente: a ocorrência atual só marca 'sent' (nunca reaproveitada) — a próxima é uma linha nova, com seu
  // próprio id/job, igual um lembrete comum (cancelável, consultável sozinha). Encadeia indefinidamente: cada disparo agenda o
  // seguinte. A próxima é garantida ANTES de marcar a atual como enviada: antes era depois, e uma falha transitória aí deixava a
  // atual 'sent' — o retry do job a encontrava concluída e saía, e a série morria em silêncio. Agora a falha derruba o job, que
  // tenta de novo (a mensagem não é reenviada: o aviso de "já disparado" vale).
  if (reminder.recurrence) await ensureNextOccurrence(reminder);

  await markReminderSent(reminder.id);
}

/**
 * Cria a próxima ocorrência e a enfileira, sem duplicar: se um retry chegar aqui depois de a próxima já ter sido criada (a falha
 * foi no passo seguinte), reaproveita a existente em vez de gerar uma segunda série. `jobId` = id do lembrete deduplica o job.
 */
async function ensureNextOccurrence(reminder: Reminder): Promise<void> {
  const nextRemindAt = computeNextOccurrence(reminder.remind_at, reminder.recurrence!);
  const nextMs = new Date(nextRemindAt).getTime();

  const pending = await listPendingReminders(reminder.account_id, 100);
  const existing = pending.find(
    (item) => item.id !== reminder.id && item.recurrence === reminder.recurrence && item.message === reminder.message && new Date(item.remind_at).getTime() === nextMs,
  );
  const next =
    existing ??
    (await createReminder(reminder.account_id, reminder.user_id, reminder.message, nextRemindAt, reminder.task_id ?? undefined, reminder.recurrence!));

  const delay = Math.max(0, nextMs - Date.now());
  await getReminderDispatchQueue().add('dispatch', { reminderId: next.id }, { delay, jobId: next.id });
}
