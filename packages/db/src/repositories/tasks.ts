import { getSupabaseClient } from '../client.js';
import type { Task, TaskStatus } from '../types.js';

export async function createTask(accountId: string, userId: string, title: string, dueAt?: string): Promise<Task> {
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .insert({ account_id: accountId, user_id: userId, title, due_at: dueAt ?? null })
    .select('*')
    .single();

  if (error) throw error;
  return data as Task;
}

const DEFAULT_TASKS_LIMIT = 50;

/**
 * `limit` existe pra não deixar a lista crescer sem teto: isto alimenta o
 * contexto da IA (tool list_tasks), então sem cap o histórico de tarefas de
 * uma conta antiga vira custo de token crescente a cada conversa, sem
 * benefício — a pessoa quase nunca precisa ver tarefa concluída há meses.
 */
export async function listTasks(
  accountId: string,
  status?: TaskStatus,
  limit: number = DEFAULT_TASKS_LIMIT,
): Promise<Task[]> {
  let query = getSupabaseClient().from('tasks').select('*').eq('account_id', accountId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function completeTask(accountId: string, taskId: string): Promise<Task> {
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('account_id', accountId)
    .select('*')
    .single();

  if (error) throw error;
  return data as Task;
}

/**
 * Remove de verdade (não soft-delete): tarefa criada por engano/duplicada não
 * tem valor histórico igual transação/lembrete tem — ao contrário de
 * completeTask, não existe "desfazer" nem consulta futura sobre uma tarefa
 * excluída. Escopado por accountId; `maybeSingle()` porque um task_id de
 * outra conta (ou já excluído) não deve virar erro — retorna null.
 */
export async function deleteTask(accountId: string, taskId: string): Promise<Task | null> {
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('account_id', accountId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as Task | null) ?? null;
}

export interface UpdateTaskInput {
  title?: string;
  /** `null` remove o prazo; `undefined` deixa como está. */
  dueAt?: string | null;
}

/** Edita título e/ou prazo de uma tarefa da conta. Null se o id não existe nessa conta. */
export async function updateTask(accountId: string, taskId: string, input: UpdateTaskInput): Promise<Task | null> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.dueAt !== undefined) patch.due_at = input.dueAt;

  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .update(patch)
    .eq('id', taskId)
    .eq('account_id', accountId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as Task | null) ?? null;
}
