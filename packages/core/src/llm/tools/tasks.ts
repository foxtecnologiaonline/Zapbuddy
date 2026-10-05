import { z } from 'zod';
import { completeTask, createTask, listTasks } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const createTaskTool = defineTool({
  name: 'create_task',
  description: 'Cria uma nova tarefa para o usuário.',
  schema: z.object({
    title: z.string().min(1),
    due_at: z.string().datetime().optional(),
  }),
  execute: async (params, ctx) => {
    const task = await createTask(ctx.userId, params.title, params.due_at);
    return { task_id: task.id, created: true };
  },
});

export const listTasksTool = defineTool({
  name: 'list_tasks',
  description: 'Lista as tarefas do usuário, opcionalmente filtradas por status.',
  schema: z.object({
    status: z.enum(['pending', 'completed']).optional(),
  }),
  execute: async (params, ctx) => {
    const tasks = await listTasks(ctx.userId, params.status);
    return { tasks };
  },
});

export const completeTaskTool = defineTool({
  name: 'complete_task',
  description: 'Marca uma tarefa do usuário como concluída, dado o task_id.',
  schema: z.object({
    task_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const task = await completeTask(ctx.userId, params.task_id);
    return { task_id: task.id, completed: true };
  },
});
