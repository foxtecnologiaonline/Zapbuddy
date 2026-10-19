import { z } from 'zod';
import { addGoalProgress, createGoal, findGoal, listGoals } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const createGoalTool = defineTool({
  name: 'create_goal',
  description:
    'Cria uma meta de economia com valor-alvo e prazo opcional (ex.: "juntar R$ 2.000 até dezembro"). ' +
    'Valor e prazo vêm sempre da pessoa. Nunca prometa rendimento nem sugira quanto render a meta.',
  schema: z.object({
    title: z.string().min(1).max(120),
    target_amount: z.number().positive().max(100_000_000),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  execute: async (params, ctx) => {
    const goal = await createGoal({
      accountId: ctx.accountId,
      userId: ctx.userId,
      title: params.title,
      targetCents: Math.round(params.target_amount * 100),
      deadline: params.deadline ?? null,
    });
    return { goal_id: goal.id, created: true };
  },
});

export const addGoalProgressTool = defineTool({
  name: 'add_goal_progress',
  description:
    'Soma um valor que a pessoa disse ter guardado numa meta, dado o goal_id. O valor é o que ela declarou — ' +
    'nunca estime. Se a meta for atingida, o retorno vem com completed: true.',
  schema: z.object({
    goal_id: z.string().uuid(),
    amount: z.number().positive().max(100_000_000),
  }),
  execute: async (params, ctx) => {
    const goal = await findGoal(ctx.accountId, params.goal_id);
    if (!goal || goal.status !== 'active') return { updated: false, reason: 'goal_not_active' };

    const updated = await addGoalProgress(goal, Math.round(params.amount * 100));
    return {
      updated: true,
      goal_id: updated.id,
      saved_cents: updated.saved_cents,
      target_cents: updated.target_cents,
      completed: updated.status === 'completed',
    };
  },
});

export const listGoalsTool = defineTool({
  name: 'list_goals',
  description: 'Lista as metas ativas da conta, com valor guardado declarado e valor-alvo.',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    const goals = await listGoals(ctx.accountId, 'active');
    return {
      goals: goals.map((goal) => ({
        goal_id: goal.id,
        title: goal.title,
        saved_cents: goal.saved_cents,
        target_cents: goal.target_cents,
        deadline: goal.deadline,
      })),
    };
  },
});
