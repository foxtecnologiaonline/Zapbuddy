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

export async function listTasks(userId: string, status?: TaskStatus): Promise<Task[]> {
  let query = getSupabaseClient().from('tasks').select('*').eq('user_id', userId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false });
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
