import { z } from 'zod';
import { createReminder, cancelReminder, updateReminder, listPendingReminders } from '@zapbuddy/db';
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

export const listRemindersTool = defineTool({
  name: 'list_reminders',
  description:
    'Lista os lembretes ainda pendentes da pessoa, do mais próximo pro mais distante, com o reminder_id de cada ' +
    'um — use pra "quais lembretes eu tenho" e pra achar o reminder_id antes de cancel_reminder ou ' +
    'update_reminder.',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    const reminders = await listPendingReminders(ctx.accountId);
    return {
      reminders: reminders.map((reminder) => ({
        reminder_id: reminder.id,
        message: reminder.message,
        remind_at: reminder.remind_at,
        recurrence: reminder.recurrence,
      })),
    };
  },
});

export const updateReminderTool = defineTool({
  name: 'update_reminder',
  description:
    'Altera um lembrete ainda pendente (mudar o horário, o texto ou a recorrência), dado o reminder_id de ' +
    'list_reminders. Informe só o que muda; recurrence: "none" torna o lembrete único. NUNCA crie um lembrete ' +
    'novo pra "remarcar" — ficariam dois avisos. Se não existir mais / já tiver disparado, retorna ' +
    'updated: false (aí pergunte se quer criar um novo).',
  schema: z
    .object({
      reminder_id: z.string().uuid(),
      message: z.string().min(1).optional(),
      remind_at: z.string().datetime().optional(),
      recurrence: z.enum(['daily', 'weekly', 'monthly', 'none']).optional(),
    })
    .refine((value) => value.message !== undefined || value.remind_at !== undefined || value.recurrence !== undefined, {
      message: 'Informe ao menos um campo pra alterar (message, remind_at ou recurrence).',
    }),
  execute: async (params, ctx) => {
    if (params.remind_at) assertFutureDate(params.remind_at, 'remind_at');

    const reminder = await updateReminder(ctx.accountId, params.reminder_id, {
      message: params.message,
      remindAtIso: params.remind_at,
      recurrence: params.recurrence === undefined ? undefined : params.recurrence === 'none' ? null : params.recurrence,
    });
    if (!reminder) return { updated: false };

    if (params.remind_at) {
      // Remarcar = trocar o job atrasado do BullMQ (mesmo jobId = reminder.id,
      // que é o que cancel_reminder também usa pra achar o job). O guard em
      // reminder-dispatch.ts cobre o caso do job antigo sobreviver ao remove.
      const queue = getReminderDispatchQueue();
      await queue.remove(reminder.id).catch(() => undefined);
      const delay = Math.max(0, new Date(reminder.remind_at).getTime() - Date.now());
      await queue.add('dispatch', { reminderId: reminder.id }, { delay, jobId: reminder.id });
    }

    return { updated: true, reminder_id: reminder.id, remind_at: reminder.remind_at, recurrence: reminder.recurrence };
  },
});
