import { z } from 'zod';
import { completeTask, createTask, deleteTask, listTasks, updateTask } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { enqueueWebhookEvent } from '../../webhooks/dispatch.js';
import { assertPlausibleTimestamp } from '../date-sanity.js';

export const createTaskTool = defineTool({
  name: 'create_task',
  description: 'Cria uma nova tarefa para o usuário.',
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

export const updateTaskTool = defineTool({
  name: 'update_task',
  description:
    'Edita o título e/ou o prazo (due_at) de uma tarefa existente, dado o task_id — use quando a pessoa ' +
    'quiser remarcar ("passa pra sexta"), corrigir o nome, ou tirar o prazo (due_at: null). Não use pra ' +
    'concluir (complete_task) nem pra apagar (delete_task). Se o task_id não existir mais, retorna updated: false.',
  schema: z.object({
    task_id: z.string().uuid(),
    title: z.string().min(1).optional(),
    due_at: z.string().datetime().nullable().optional(),
  }),
  execute: async (params, ctx) => {
    if (params.title === undefined && params.due_at === undefined) {
      throw new Error('Informe title e/ou due_at — não há o que alterar.');
    }
    if (params.due_at) assertPlausibleTimestamp(params.due_at, 'due_at');

    const task = await updateTask(ctx.accountId, params.task_id, { title: params.title, dueAt: params.due_at });
    return task ? { updated: true, task_id: task.id, title: task.title, due_at: task.due_at } : { updated: false };
  },
});

export const deleteTaskTool = defineTool({
  name: 'delete_task',
  description:
    'Exclui definitivamente uma tarefa do usuário, dado o task_id — use quando a pessoa disser que ' +
    'criou por engano, duplicou, ou simplesmente não quer mais aquela tarefa (nunca para "concluir", ' +
    'isso é complete_task). Se o task_id não existir mais nessa conta, retorna deleted: false.',
  schema: z.object({
    task_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const task = await deleteTask(ctx.accountId, params.task_id);
    return task ? { deleted: true, task_id: task.id } : { deleted: false };
  },
});
