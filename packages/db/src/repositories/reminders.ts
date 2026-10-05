import { getSupabaseClient } from '../client.js';
import type { Reminder } from '../types.js';

export async function createReminder(
  userId: string,
  message: string,
  remindAtIso: string,
  taskId?: string,
): Promise<Reminder> {
  const { data, error } = await getSupabaseClient()
    .from('reminders')
    .insert({ user_id: userId, message, remind_at: remindAtIso, task_id: taskId ?? null })
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
