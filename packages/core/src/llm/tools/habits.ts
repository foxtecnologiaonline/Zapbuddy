import { z } from 'zod';
import { archiveHabit, createHabit, findActiveHabit, listActiveHabits, listHabitCheckinDates, logHabitCheckin } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { computeHabitStats, localDateKey, shiftDateKey } from '../../habits/streak.js';

/** Quantos dias pra trás ainda dá pra marcar ("esqueci de marcar ontem") — mais que isso é provável erro de data. */
const MAX_BACKFILL_DAYS = 7;

export const createHabitTool = defineTool({
  name: 'create_habit',
  description:
    'Cria um hábito/rotina pra acompanhar a constância (ex.: "ir à academia", "ler 20 minutos", "beber 2L de ' +
    'água") — algo que se REPETE e que a pessoa vai marcar como feito nos dias. Diferente de create_personal_goal ' +
    '(algo a alcançar, sem rotina), de create_task (uma vez só) e de create_reminder (avisar numa hora).',
  schema: z.object({
    name: z.string().min(1).max(120),
  }),
  execute: async (params, ctx) => {
    const habit = await createHabit(ctx.accountId, ctx.userId, params.name);
    return { habit_id: habit.id, created: true };
  },
});

export const logHabitCheckinTool = defineTool({
  name: 'log_habit_checkin',
  description:
    'Marca que a pessoa FEZ o hábito (ex.: "fui pra academia hoje", "li ontem"). habit_id vem de list_habits — ' +
    'consulte antes se não souber qual é. date (YYYY-MM-DD, data local dela) é opcional: sem ela, vale hoje; ' +
    `aceita até ${MAX_BACKFILL_DAYS} dias pra trás e nunca o futuro. Marcar o mesmo dia de novo é seguro ` +
    '(already_logged: true). Devolve a sequência atual — comemore sem exagero, e só com o número que vier aqui.',
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
    'Lista os hábitos ativos da pessoa com o habit_id, se já foi feito hoje, a sequência atual (dias seguidos) e ' +
    'quantos dos últimos 7 dias foram feitos. Use pra "como estão meus hábitos" e pra achar o habit_id antes de ' +
    'log_habit_checkin ou archive_habit. Os números vêm calculados daqui — nunca estime sequência de cabeça.',
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
    'Para de acompanhar um hábito (a pessoa desistiu ou não faz mais parte da rotina), dado o habit_id de ' +
    'list_habits. O histórico fica guardado. Se não existir mais, retorna archived: false.',
  schema: z.object({
    habit_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const habit = await archiveHabit(ctx.accountId, params.habit_id);
    return habit ? { archived: true, habit_id: habit.id } : { archived: false };
  },
});
