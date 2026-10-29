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

/**
 * Tarefas pendentes com entrega dentro de [fromIso, toIso], filtradas no
 * banco — listTasks corta em 50 por criação, então numa conta com muitas
 * pendentes uma tarefa de hoje podia ficar de fora do resumo matinal.
 */
/**
 * Tarefas pendentes com prazo vencido (antes de `beforeIso`) que o resumo
 * matinal ainda não perguntou se foram concluídas (migration 0022). As mais
 * recentes primeiro e com teto: um acúmulo antigo não vira uma parede de
 * perguntas num dia só — o resto fica pros dias seguintes.
 */
export async function listOverdueTasksAwaitingFollowUp(accountId: string, beforeIso: string, limit = 5): Promise<Task[]> {
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .lt('due_at', beforeIso)
    .is('follow_up_asked_at', null)
    .order('due_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function listPendingTasksDueBetween(accountId: string, fromIso: string, toIso: string): Promise<Task[]> {
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .gte('due_at', fromIso)
    .lte('due_at', toIso)
    .order('due_at', { ascending: true });
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

export interface UpdateTaskInput {
  title?: string;
  /** `null` remove o prazo; `undefined` deixa como está. */
  dueAt?: string | null;
}

/** Edita título e/ou prazo de uma tarefa da conta. Null se o id não existe nessa conta. */
export async function updateTask(accountId: string, taskId: string, input: UpdateTaskInput): Promise<Task | null> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.dueAt !== undefined) {
    patch.due_at = input.dueAt;
    // Prazo novo: vale perguntar de novo se foi concluída quando essa data passar (migration 0022).
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

/** Tarefas concluídas numa janela (fechamento do dia / revisão da semana). */
export async function listCompletedTasksBetween(accountId: string, fromIso: string, toIso: string, limit = 50): Promise<Task[]> {
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'completed')
    .gte('completed_at', fromIso)
    .lte('completed_at', toIso)
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Task[];
}

/** Pendentes com prazo já vencido (mais antigas primeiro). */
export async function listOverduePendingTasks(accountId: string, beforeIso: string, limit = 20): Promise<Task[]> {
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .lt('due_at', beforeIso)
    .order('due_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Task[];
}

/** Pendentes sem prazo nenhum (a "caixa de entrada" de tarefas). */
export async function listUndatedPendingTasks(accountId: string, limit = 10): Promise<Task[]> {
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .is('due_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Task[];
}
