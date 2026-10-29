import { z } from 'zod';
import { completeTask, createTask, deleteTask, listTasks, updateTask } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { enqueueWebhookEvent } from '../../webhooks/dispatch.js';
import { assertPlausibleTimestamp } from '../date-sanity.js';

export const createTaskTool = defineTool({
  name: 'create_task',
  description:
    'Cria uma tarefa. due_at opcional: se ela deu só o DIA, use 23:59:59 daquele dia no fuso dela ("o dia todo", sem hora); hora específica só se ela disse.',
  schema: z.object({
    title: z.string().min(1),
    due_at: z.string().datetime().optional(),
  }),
  execute: async (params, ctx) => {
    if (params.due_at) assertPlausibleTimestamp(params.due_at, 'due_at');
    const task = await createTask(ctx.accountId, ctx.userId, params.title, params.due_at);
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
    const tasks = await listTasks(ctx.accountId, params.status);
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
    const task = await completeTask(ctx.accountId, params.task_id);
    enqueueWebhookEvent(ctx.accountId, 'task.completed', { task_id: task.id, title: task.title });
    return { task_id: task.id, completed: true };
  },
});

export const deleteTaskTool = defineTool({
  name: 'delete_task',
  description:
    'Exclui uma tarefa (task_id) criada por engano, duplicada ou sem interesse — nunca pra concluir (complete_task). deleted:false se não existe.',
  schema: z.object({
    task_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const task = await deleteTask(ctx.accountId, params.task_id);
    return task ? { deleted: true, task_id: task.id } : { deleted: false };
  },
});

export const updateTaskTool = defineTool({
  name: 'update_task',
  description:
    'Altera título e/ou prazo de uma tarefa (task_id de list_tasks). Só o que muda; due_at:null remove o prazo. NUNCA crie outra nem apague e recrie. updated:false se não existe.',
  schema: z
    .object({
      task_id: z.string().uuid(),
      title: z.string().min(1).optional(),
      due_at: z.string().datetime().nullable().optional(),
    })
    .refine((value) => value.title !== undefined || value.due_at !== undefined, {
      message: 'Informe ao menos um campo pra alterar (title ou due_at).',
    }),
  execute: async (params, ctx) => {
    if (params.due_at) assertPlausibleTimestamp(params.due_at, 'due_at');
    const task = await updateTask(ctx.accountId, params.task_id, { title: params.title, dueAt: params.due_at });
    return task ? { updated: true, task_id: task.id } : { updated: false };
  },
});
