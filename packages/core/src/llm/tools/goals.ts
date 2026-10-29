import { z } from 'zod';
import { completePersonalGoal, createPersonalGoal, deletePersonalGoal, listPersonalGoals } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const createPersonalGoalTool = defineTool({
  name: 'create_personal_goal',
  description:
    'Cria meta pessoal/profissional qualitativa, sem valor ("quero ler mais"). Algo a fazer até uma data é create_task; juntar dinheiro é create_goal.',
  schema: z.object({
    description: z.string().min(1).max(300),
  }),
  execute: async (params, ctx) => {
    const goal = await createPersonalGoal(ctx.accountId, ctx.userId, params.description);
    return { goal_id: goal.id, created: true };
  },
});

export const listPersonalGoalsTool = defineTool({
  name: 'list_personal_goals',
  description: 'Lista as metas pessoais do usuário, opcionalmente filtradas por status.',
  schema: z.object({
    status: z.enum(['pending', 'done']).optional(),
  }),
  execute: async (params, ctx) => {
    const goals = await listPersonalGoals(ctx.accountId, params.status);
    return { goals };
  },
});

export const completePersonalGoalTool = defineTool({
  name: 'complete_personal_goal',
  description: 'Marca uma meta pessoal como concluída, dado o goal_id.',
  schema: z.object({
    goal_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const goal = await completePersonalGoal(ctx.accountId, params.goal_id);
    return { goal_id: goal.id, completed: true };
  },
});

export const deletePersonalGoalTool = defineTool({
  name: 'delete_personal_goal',
  description:
    'Exclui uma meta pessoal (goal_id) que ela desistiu ou criou errado — concluir é complete_personal_goal.',
  schema: z.object({
    goal_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const goal = await deletePersonalGoal(ctx.accountId, params.goal_id);
    return goal ? { deleted: true, goal_id: goal.id } : { deleted: false };
  },
});
