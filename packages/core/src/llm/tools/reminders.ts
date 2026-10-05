import { z } from 'zod';
import { createReminder } from '@zapbuddy/db';
import { getReminderDispatchQueue } from '../../queues/definitions.js';
import { defineTool } from '../tool-types.js';

export const createReminderTool = defineTool({
  name: 'create_reminder',
  description: 'Agenda um lembrete para o usuário em uma data/hora futura específica.',
  schema: z.object({
    message: z.string().min(1),
    remind_at: z.string().datetime(),
    task_id: z.string().uuid().optional(),
  }),
  execute: async (params, ctx) => {
    const reminder = await createReminder(ctx.userId, params.message, params.remind_at, params.task_id);

    const delay = Math.max(0, new Date(params.remind_at).getTime() - Date.now());
    await getReminderDispatchQueue().add(
      'dispatch',
      { reminderId: reminder.id },
      { delay, jobId: reminder.id },
    );

    return { reminder_id: reminder.id, scheduled: true };
  },
});
