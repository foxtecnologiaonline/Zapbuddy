import { z } from 'zod';
import { archiveHabit, createHabit, findActiveHabit, listActiveHabits, listHabitCheckinDates, logHabitCheckin } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { computeHabitStats, localDateKey, shiftDateKey } from '../../habits/streak.js';

/** Quantos dias pra trás ainda dá pra marcar ("esqueci de marcar ontem") — mais que isso é provável erro de data. */
const MAX_BACKFILL_DAYS = 7;

export const createHabitTool = defineTool({
  name: 'create_habit',
  description:
    'Cria hábito que se REPETE e ela marca nos dias ("academia", "ler 20 min"). Algo a alcançar é create_personal_goal; uma vez só, create_task; avisar numa hora, create_reminder.',
  schema: z.object({
    name: z.string().min(1).max(120),
  }),
  execute: async (params, ctx) => {
    // Mesmo nome (sem diferenciar maiúscula/espaço) já ativo = o mesmo hábito: devolve o existente em vez de duplicar
    // (o modelo repete a chamada com facilidade quando a conversa dá uma volta).
    const normalized = params.name.trim().toLowerCase();
    const existing = (await listActiveHabits(ctx.accountId)).find((habit) => habit.name.trim().toLowerCase() === normalized);
    if (existing) return { habit_id: existing.id, created: false, already_exists: true };

    const habit = await createHabit(ctx.accountId, ctx.userId, params.name);
    return { habit_id: habit.id, created: true };
  },
});

export const logHabitCheckinTool = defineTool({
  name: 'log_habit_checkin',
  description:
    'Marca que ela FEZ o hábito (habit_id de list_habits). date YYYY-MM-DD opcional (padrão hoje; até 7 dias atrás, nunca futuro). Repetir é seguro (already_logged). Comemore só com a sequência que a tool devolver.',
  schema: z.object({
    habit_id: z.string().uuid(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  execute: async (params, ctx) => {
    const todayKey = localDateKey(ctx.timezone);
    const date = params.date ?? todayKey;
    if (date > todayKey) throw new Error('Não dá pra marcar um dia que ainda não chegou.');
    if (date < shiftDateKey(todayKey, -MAX_BACKFILL_DAYS)) {
      throw new Error(`Só dá pra marcar até ${MAX_BACKFILL_DAYS} dias pra trás — confirme a data com a pessoa.`);
    }

    const habit = await findActiveHabit(ctx.accountId, params.habit_id);
    if (!habit) return { logged: false, reason: 'habit_not_found' };

    const { checkin, created } = await logHabitCheckin(ctx.accountId, ctx.userId, habit.id, date);
    const dates = (await listHabitCheckinDates(ctx.accountId, todayKey))[habit.id] ?? [];
    const stats = computeHabitStats(dates, todayKey);

    return {
      logged: created,
      already_logged: !created,
      ...(checkin ? { checkin_id: checkin.id } : {}),
      habit: habit.name,
      date,
      current_streak: stats.currentStreak,
      last_7_days: stats.last7Days,
    };
  },
});

export const listHabitsTool = defineTool({
  name: 'list_habits',
  description:
    'Hábitos ativos com habit_id, feito hoje, sequência e últimos 7 dias. Números sempre daqui, nunca de cabeça.',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    const todayKey = localDateKey(ctx.timezone);
    const [habits, datesByHabit] = await Promise.all([listActiveHabits(ctx.accountId), listHabitCheckinDates(ctx.accountId, todayKey)]);
    return {
      habits: habits.map((habit) => {
        const stats = computeHabitStats(datesByHabit[habit.id] ?? [], todayKey);
        return {
          habit_id: habit.id,
          name: habit.name,
          done_today: stats.doneToday,
          current_streak: stats.currentStreak,
          last_7_days: stats.last7Days,
        };
      }),
    };
  },
});

export const archiveHabitTool = defineTool({
  name: 'archive_habit',
  description:
    'Para de acompanhar um hábito (habit_id); o histórico fica.',
  schema: z.object({
    habit_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const habit = await archiveHabit(ctx.accountId, params.habit_id);
    return habit ? { archived: true, habit_id: habit.id } : { archived: false };
  },
});
