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
 * Edita título e/ou prazo de uma tarefa (`dueAt: null` remove o prazo).
 * Mudar o prazo zera `follow_up_asked_at`: com data nova, vale perguntar de
 * novo se ela foi concluída quando essa data passar (migration 0022).
 * `maybeSingle()` — id de outra conta ou já excluído devolve null.
 */
export async function updateTask(
  accountId: string,
  taskId: string,
  changes: { title?: string; dueAt?: string | null },
): Promise<Task | null> {
  const patch: Record<string, unknown> = {};
  if (changes.title !== undefined) patch.title = changes.title;
  if (changes.dueAt !== undefined) {
    patch.due_at = changes.dueAt;
    patch.follow_up_asked_at = null;
  }

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

/**
 * Marca que o resumo matinal já perguntou, uma vez, se essa tarefa atrasada
 * foi concluída — pra não repetir a mesma pergunta todo dia (ver migration
 * 0022). Não muda `status`/`completed_at`: a resposta da pessoa é quem
 * decide isso, via `complete_task` numa mensagem normal.
 */
export async function markTaskFollowUpAsked(accountId: string, taskId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('tasks')
    .update({ follow_up_asked_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('account_id', accountId);

  if (error) throw error;
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
