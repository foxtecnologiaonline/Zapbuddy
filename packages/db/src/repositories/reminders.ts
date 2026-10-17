import { getSupabaseClient } from '../client.js';
import type { Reminder } from '../types.js';

export async function createReminder(
  accountId: string,
  userId: string,
  message: string,
  remindAtIso: string,
  taskId?: string,
): Promise<Reminder> {
  const { data, error } = await getSupabaseClient()
    .from('reminders')
    .insert({ account_id: accountId, user_id: userId, message, remind_at: remindAtIso, task_id: taskId ?? null })
    .select('*')
    .single();

  if (error) throw error;
  return data as Reminder;
}

/** Reminders due now, used by the worker's scheduled sweep. */
export async function listDueReminders(nowIso: string): Promise<Reminder[]> {
  const { data, error } = await getSupabaseClient()
    .from('reminders')
    .select('*')
    .eq('status', 'pending')
    .lte('remind_at', nowIso);

  if (error) throw error;
  return (data ?? []) as Reminder[];
}

export async function findPendingReminderById(reminderId: string): Promise<Reminder | null> {
  const { data, error } = await getSupabaseClient()
    .from('reminders')
    .select('*')
    .eq('id', reminderId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) throw error;
  return data as Reminder | null;
}

export async function markReminderSent(reminderId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('reminders')
    .update({ status: 'sent' })
    .eq('id', reminderId);

  if (error) throw error;
}

/**
 * Chamado quando TODAS as tentativas de envio (BullMQ) se esgotaram — ver
 * worker.ts. Sem isto, um lembrete que falhasse permanentemente (ex.: fora
 * da janela de 24h da WhatsApp Cloud API, que exige template aprovado pra
 * mensagem livre nesse caso) ficava preso em 'pending' pra sempre,
 * indistinguível de um que ainda vai disparar.
 */
export async function markReminderFailed(reminderId: string, reason: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('reminders')
    .update({ status: 'failed', failed_reason: reason.slice(0, 500) })
    .eq('id', reminderId)
    .eq('status', 'pending');

  if (error) throw error;
}

/**
 * Total atual de lembretes travados em 'failed', sem janela de tempo: a
 * tabela só guarda `created_at` (quando o lembrete foi agendado), não quando
 * ele falhou — um filtro por data aqui contaria errado (lembrete agendado há
 * dias mas que falhou hoje ficaria fora da janela "hoje").
 */
export async function countFailedReminders(): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from('reminders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed');

  if (error) throw error;
  return count ?? 0;
}

export async function listRecentFailedReminders(limit: number): Promise<Reminder[]> {
  const { data, error } = await getSupabaseClient()
    .from('reminders')
    .select('*')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Reminder[];
}
