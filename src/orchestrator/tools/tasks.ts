import { getSupabase } from "../../db/supabase";
import { AppError } from "../../lib/errors";
import { Task } from "../../types";

export const criarTarefaTool = {
  name: "criar_tarefa",
  description: "Cria uma tarefa ou lembrete para o usuário.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string" },
      dueAt: { type: "string", description: "ISO 8601, opcional" },
    },
    required: ["title"],
  },
};

export async function criarTarefa(userId: string, input: { title: string; dueAt?: string }): Promise<Task> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .insert({ user_id: userId, title: input.title, due_at: input.dueAt ?? null })
    .select("*")
    .single();

  if (error || !data) {
    throw new AppError(`Falha ao criar tarefa: ${error?.message}`, "Não consegui salvar essa tarefa agora.");
  }
  return data as Task;
}

export const listarTarefasTool = {
  name: "listar_tarefas",
  description: "Lista as tarefas pendentes do usuário.",
  input_schema: { type: "object" as const, properties: {} },
};

export async function listarTarefas(userId: string): Promise<Task[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw new AppError(`Falha ao listar tarefas: ${error.message}`, "Não consegui buscar suas tarefas agora.");
  }
  return (data ?? []) as Task[];
}

export const concluirTarefaTool = {
  name: "concluir_tarefa",
  description: "Marca uma tarefa como concluída.",
  input_schema: {
    type: "object" as const,
    properties: { tarefaId: { type: "string" } },
    required: ["tarefaId"],
  },
};

export async function concluirTarefa(userId: string, input: { tarefaId: string }): Promise<Task> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", input.tarefaId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new AppError(`Falha ao concluir tarefa: ${error?.message}`, "Não encontrei essa tarefa para concluir.");
  }
  return data as Task;
}
