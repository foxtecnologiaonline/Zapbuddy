import { registrarTransacaoTool, registrarTransacao, corrigirCategoriaTool, corrigirCategoria } from "./finance";
import {
  criarTarefaTool,
  criarTarefa,
  listarTarefasTool,
  listarTarefas,
  concluirTarefaTool,
  concluirTarefa,
} from "./tasks";

export const toolDefinitions = [
  registrarTransacaoTool,
  corrigirCategoriaTool,
  criarTarefaTool,
  listarTarefasTool,
  concluirTarefaTool,
];

type ToolHandler = (userId: string, input: any) => Promise<unknown>;

export const toolHandlers: Record<string, ToolHandler> = {
  registrar_transacao: registrarTransacao,
  corrigir_categoria: corrigirCategoria,
  criar_tarefa: criarTarefa,
  listar_tarefas: (userId: string) => listarTarefas(userId),
  concluir_tarefa: concluirTarefa,
};
