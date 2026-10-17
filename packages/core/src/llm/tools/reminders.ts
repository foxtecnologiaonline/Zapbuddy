import { z } from 'zod';
import { createReminder, cancelReminder } from '@zapbuddy/db';
import { getReminderDispatchQueue } from '../../queues/definitions.js';
import { defineTool } from '../tool-types.js';
import { assertFutureDate } from '../date-sanity.js';

export const createReminderTool = defineTool({
  name: 'create_reminder',
  description:
    'Agenda um lembrete para o usuário em uma data/hora futura específica. Use recurrence quando a ' +
    'pessoa pedir algo que se repete (ex.: "todo dia", "toda semana", "todo mês") — cada disparo ' +
    'recorrente cria automaticamente a próxima ocorrência, sem precisar pedir de novo.',
  schema: z.object({
    message: z.string().min(1),
    remind_at: z.string().datetime(),
    task_id: z.string().uuid().optional(),
    recurrence: z.enum(['daily', 'weekly', 'monthly']).optional(),
  }),
  execute: async (params, ctx) => {
    assertFutureDate(params.remind_at, 'remind_at');

    const reminder = await createReminder(
      ctx.accountId,
      ctx.userId,
      params.message,
      params.remind_at,
      params.task_id,
      params.recurrence,
    );

    const delay = Math.max(0, new Date(params.remind_at).getTime() - Date.now());
    await getReminderDispatchQueue().add(
      'dispatch',
      { reminderId: reminder.id },
      { delay, jobId: reminder.id },
    );

    return { reminder_id: reminder.id, scheduled: true, recurrence: params.recurrence ?? null };
  },
});

export const cancelReminderTool = defineTool({
  name: 'cancel_reminder',
  description:
    'Cancela um lembrete ainda não disparado, dado o reminder_id — use quando a pessoa não quer mais ' +
    'ser avisada daquilo (ex.: já resolveu, mudou de ideia). Se não existir mais / já tiver disparado, ' +
    'retorna cancelled: false.',
  schema: z.object({
    reminder_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const reminder = await cancelReminder(ctx.accountId, params.reminder_id);
    if (!reminder) return { cancelled: false };

    // Best-effort: remove o job atrasado do BullMQ pra não ocupar espaço à
    // toa. Mesmo se isso falhar, reminder-dispatch.ts já faz
    // findPendingReminderById antes de enviar — como o status virou
    // 'cancelled' acima, o disparo é um no-op seguro de qualquer forma.
    await getReminderDispatchQueue()
      .remove(reminder.id)
      .catch(() => undefined);

    return { cancelled: true, reminder_id: reminder.id };
  },
});
