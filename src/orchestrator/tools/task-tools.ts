import { createTask, listPendingTasks, completeTaskByTitle } from '../../repositories/tasks';
import type { ToolDefinition, ToolHandler } from './types';

export const criarTarefaTool: ToolDefinition = {
  name: 'criar_tarefa',
  description: 'Cria uma tarefa ou lembrete pro cliente.',
  input_schema: {
    type: 'object',
    properties: {
      titulo: { type: 'string', description: 'descrição curta da tarefa, ex: "Pagar fornecedor X"' },
      data_vencimento: {
        type: 'string',
        description: 'data/hora ISO 8601 opcional, se o cliente mencionou um prazo ou horário',
      },
    },
    required: ['titulo'],
  },
};

export const listarTarefasTool: ToolDefinition = {
  name: 'listar_tarefas',
  description: 'Lista as tarefas pendentes do cliente.',
  input_schema: { type: 'object', properties: {} },
};

export const concluirTarefaTool: ToolDefinition = {
  name: 'concluir_tarefa',
  description:
    'Marca uma tarefa como concluída. Use o título como o cliente mencionou — não precisa ser exato, faz busca aproximada.',
  input_schema: {
    type: 'object',
    properties: {
      titulo: { type: 'string', description: 'título ou parte do título da tarefa a concluir' },
    },
    required: ['titulo'],
  },
};

interface CriarTarefaInput {
  titulo: string;
  data_vencimento?: string;
}

export const handleCriarTarefa: ToolHandler = async (input: CriarTarefaInput, context) => {
  if (!input.titulo || !input.titulo.trim()) {
    return JSON.stringify({ erro: 'título vazio' });
  }

  const task = await createTask({
    clientId: context.clientId,
    title: input.titulo.trim(),
    dueAt: input.data_vencimento ?? null,
  });

  return JSON.stringify({ criada: true, id: task.id, titulo: task.title });
};

export const handleListarTarefas: ToolHandler = async (_input, context) => {
  const tasks = await listPendingTasks(context.clientId);

  return JSON.stringify({
    tarefas: tasks.map((task) => ({ titulo: task.title, vencimento: task.dueAt })),
  });
};

interface ConcluirTarefaInput {
  titulo: string;
}

export const handleConcluirTarefa: ToolHandler = async (input: ConcluirTarefaInput, context) => {
  const task = await completeTaskByTitle(context.clientId, input.titulo);

  if (!task) {
    return JSON.stringify({ concluida: false, motivo: 'tarefa não encontrada' });
  }

  return JSON.stringify({ concluida: true, titulo: task.title });
};
