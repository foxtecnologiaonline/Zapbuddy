import { supabase } from '../lib/supabase';

export type TaskStatus = 'pending' | 'done';

export interface Task {
  id: string;
  clientId: string;
  title: string;
  status: TaskStatus;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface TaskRow {
  id: string;
  client_id: string;
  title: string;
  status: TaskStatus;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
}

function mapRow(row: TaskRow): Task {
  return {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    status: row.status,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export async function createTask(input: { clientId: string; title: string; dueAt?: string | null }): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ client_id: input.clientId, title: input.title, due_at: input.dueAt ?? null })
    .select('*')
    .single();

  if (error) throw error;
  return mapRow(data as TaskRow);
}

export async function listPendingTasks(clientId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .order('due_at', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data as TaskRow[]).map(mapRow);
}

// Escapa os wildcards do ILIKE (%, _, \) pra um título com esses caracteres
// (ex: "pagar 50%") não virar um padrão de busca amplo sem querer.
function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Concluir por título (não por id) porque é assim que o cliente se refere à
// tarefa numa mensagem de WhatsApp — ele não sabe nenhum UUID.
export async function completeTaskByTitle(clientId: string, title: string): Promise<Task | null> {
  const { data: match, error: findError } = await supabase
    .from('tasks')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .ilike('title', `%${escapeIlikePattern(title)}%`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;
  if (!match) return null;

  const { data: updated, error: updateError } = await supabase
    .from('tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', (match as TaskRow).id)
    .select('*')
    .single();

  if (updateError) throw updateError;
  return mapRow(updated as TaskRow);
}
