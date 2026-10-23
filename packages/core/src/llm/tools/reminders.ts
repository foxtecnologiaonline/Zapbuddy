import { z } from 'zod';
import { createReminder, cancelReminder, listAccountReminders, findAccountReminderById } from '@zapbuddy/db';
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
    'Lista os lembretes da conta: os próximos (pending) e os últimos que já dispararam (sent), cada um com ' +
    'reminder_id. Use pra achar o id antes de cancelar ou adiar ("adia aquele lembrete", "o que você vai ' +
    'me lembrar essa semana?") — o lembrete que acabou de disparar também aparece aqui.',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    const [pending, sent] = await Promise.all([
      listAccountReminders(ctx.accountId, 'pending', 20),
      listAccountReminders(ctx.accountId, 'sent', 5),
    ]);
    const view = (r: (typeof pending)[number]) => ({
      reminder_id: r.id,
      message: r.message,
      remind_at: r.remind_at,
      status: r.status,
      recurrence: r.recurrence,
    });
    return { reminders: [...pending.map(view), ...sent.map(view)] };
  },
});

export const rescheduleReminderTool = defineTool({
  name: 'reschedule_reminder',
  description:
    'Adia/remarca um lembrete para um novo horário futuro, dado o reminder_id (pegue em list_reminders) — ' +
    'funciona tanto pra um lembrete ainda pendente quanto pra um que já disparou e a pessoa quer que ' +
    'avise de novo ("adia pra amanhã às 9", "me lembra de novo daqui a 1 hora"). Se o id não existir ' +
    'mais ou já foi cancelado, retorna rescheduled: false.',
  schema: z.object({
    reminder_id: z.string().uuid(),
    remind_at: z.string().datetime(),
  }),
  execute: async (params, ctx) => {
    assertFutureDate(params.remind_at, 'remind_at');

    const original = await findAccountReminderById(ctx.accountId, params.reminder_id);
    if (!original || original.status === 'cancelled') return { rescheduled: false };

    // Pendente: move o lembrete (e a série, se recorrente) — cancela o antigo
    // e cria um novo. Já disparado: a repetição recorrente já foi encadeada
    // pelo próprio disparo, então o novo é avulso (sem recurrence).
    const wasPending = original.status === 'pending';
    if (wasPending) {
      await cancelReminder(ctx.accountId, original.id);
      await getReminderDispatchQueue()
        .remove(original.id)
        .catch(() => undefined);
    }

    const next = await createReminder(
      ctx.accountId,
      ctx.userId,
      original.message,
      params.remind_at,
      original.task_id ?? undefined,
      wasPending ? (original.recurrence ?? undefined) : undefined,
    );
    const delay = Math.max(0, new Date(params.remind_at).getTime() - Date.now());
    await getReminderDispatchQueue().add('dispatch', { reminderId: next.id }, { delay, jobId: next.id });

    return { rescheduled: true, reminder_id: next.id, remind_at: params.remind_at };
  },
});
