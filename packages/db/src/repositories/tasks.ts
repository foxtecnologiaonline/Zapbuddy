import { getSupabaseClient } from '../client.js';
import type { Task, TaskStatus } from '../types.js';

export async function createTask(userId: string, title: string, dueAt?: string): Promise<Task> {
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .insert({ user_id: userId, title, due_at: dueAt ?? null })
    .select('*')
    .single();

  if (error) throw error;
  return data as Task;
}

const DEFAULT_TASKS_LIMIT = 50;

/**
 * `limit` existe pra não deixar a lista crescer sem teto: isto alimenta o
 * contexto da IA (tool list_tasks), então sem cap o histórico de tarefas de
 * um usuário antigo vira custo de token crescente a cada conversa, sem
 * benefício — a pessoa quase nunca precisa ver tarefa concluída há meses.
 */
export async function listTasks(
  userId: string,
  status?: TaskStatus,
  limit: number = DEFAULT_TASKS_LIMIT,
): Promise<Task[]> {
  let query = getSupabaseClient().from('tasks').select('*').eq('user_id', userId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function completeTask(userId: string, taskId: string): Promise<Task> {
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return data as Task;
}
