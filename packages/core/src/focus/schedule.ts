import { createReminder } from '@zapbuddy/db';
import { getReminderDispatchQueue } from '../queues/definitions.js';

export const MIN_FOCUS_MINUTES = 5;
export const MAX_FOCUS_MINUTES = 120;

/**
 * Foco/pomodoro: nada de timer próprio — vira um lembrete comum daqui a N
 * minutos (mesma fila, mesmo envio, mesmo cancelamento por list_reminders).
 */
export async function scheduleFocusEnd(accountId: string, userId: string, minutes: number): Promise<{ reminderId: string; endsAtIso: string }> {
  if (!Number.isInteger(minutes) || minutes < MIN_FOCUS_MINUTES || minutes > MAX_FOCUS_MINUTES) {
    throw new Error(`O foco vai de ${MIN_FOCUS_MINUTES} a ${MAX_FOCUS_MINUTES} minutos.`);
  }
  const endsAt = new Date(Date.now() + minutes * 60_000);
  const reminder = await createReminder(accountId, userId, `o foco de ${minutes} minutos terminou, hora de uma pausa`, endsAt.toISOString());
  await getReminderDispatchQueue().add('dispatch', { reminderId: reminder.id }, { delay: minutes * 60_000, jobId: reminder.id });
  return { reminderId: reminder.id, endsAtIso: endsAt.toISOString() };
}
