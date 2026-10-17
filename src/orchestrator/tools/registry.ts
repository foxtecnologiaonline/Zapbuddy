import type { ToolDefinition, ToolHandler } from './types';
import {
  registrarTransacaoTool,
  resumoFinanceiroTool,
  handleRegistrarTransacao,
  handleResumoFinanceiro,
} from './finance-tools';
import {
  criarTarefaTool,
  listarTarefasTool,
  concluirTarefaTool,
  handleCriarTarefa,
  handleListarTarefas,
  handleConcluirTarefa,
} from './task-tools';

export const toolDefinitions: ToolDefinition[] = [
  registrarTransacaoTool,
  resumoFinanceiroTool,
  criarTarefaTool,
  listarTarefasTool,
  concluirTarefaTool,
];

export const toolHandlers: Record<string, ToolHandler> = {
  registrar_transacao: handleRegistrarTransacao,
  resumo_financeiro: handleResumoFinanceiro,
  criar_tarefa: handleCriarTarefa,
  listar_tarefas: handleListarTarefas,
  concluir_tarefa: handleConcluirTarefa,
};
