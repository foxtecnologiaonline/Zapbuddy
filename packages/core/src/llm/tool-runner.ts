import { logToolCall, logger } from '@zapbuddy/db';
import { getToolByName } from './tool-registry.js';
import type { ToolContext } from './tool-types.js';

/** Provider-agnostic shape of a tool call request — each LLM provider translates its own format into this. */
export interface ToolCallRequest {
  id: string;
  name: string;
  input: unknown;
}

/** Provider-agnostic shape of a tool call outcome — each provider translates this back into its own tool-result format. */
export interface ToolCallOutcome {
  id: string;
  content: string;
  isError: boolean;
}

/**
 * Executa uma tool call e loga o resultado — compartilhado por todos os
 * providers de LLM (Anthropic, OpenAI de fallback, ...) pra que a regra
 * não-negociável do CLAUDE.md ("a IA nunca inventa dado financeiro, tool
 * sempre roda antes de confirmar") valha igual não importa qual LLM decidiu
 * chamar a tool.
 */
export async function runToolCall(call: ToolCallRequest, ctx: ToolContext): Promise<ToolCallOutcome> {
  const startedAt = Date.now();
  const tool = getToolByName(call.name);

  if (!tool) {
    logger.error('tool_call_failed', { toolName: call.name, userId: ctx.userId, error: 'unknown tool' });
    await safeLogToolCall({
      userId: ctx.userId,
      toolName: call.name,
      parameters: (call.input as Record<string, unknown>) ?? {},
      result: null,
      success: false,
      error: 'unknown tool',
      durationMs: Date.now() - startedAt,
    });
    return { id: call.id, isError: true, content: `Tool desconhecida: ${call.name}` };
  }

  // Turno reexecutado (fallback de provider, retry do job): a mesma chamada que já teve efeito devolve o resultado gravado em
  // vez de executar de novo — sem isto o gasto/tarefa/lembrete saía duplicado. Não passa pelo log: não é uma chamada nova.
  const replayed = ctx.turnLedger?.replay(tool.name, call.input);
  if (replayed !== null && replayed !== undefined) {
    logger.info('tool_call_replayed', { toolName: tool.name, userId: ctx.userId });
    return { id: call.id, isError: false, content: replayed };
  }

  let result: unknown;
  try {
    const parsed = tool.schema.parse(call.input);
    result = await tool.execute(parsed, ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('tool_call_failed', { toolName: tool.name, userId: ctx.userId, error: message });
    await safeLogToolCall({
      userId: ctx.userId,
      toolName: tool.name,
      parameters: (call.input as Record<string, unknown>) ?? {},
      result: null,
      success: false,
      error: message,
      durationMs: Date.now() - startedAt,
    });
    return { id: call.id, isError: true, content: `Erro ao executar ${tool.name}: ${message}` };
  }

  // A tool JÁ teve efeito aqui. Gravar no registro do turno ANTES do log, e o log nunca pode virar "erro": antes uma falha só
  // no `logToolCall` (banco instável) caía no catch e devolvia "Erro ao executar" de uma ação que tinha acontecido — o Tom
  // dizia que falhou, a pessoa repetia o pedido e ficava duplicado.
  const content = JSON.stringify(result) ?? 'null'; // tool sem retorno: JSON.stringify(undefined) não é string
  ctx.turnLedger?.record(tool.name, call.input, content);
  await safeLogToolCall({
    userId: ctx.userId,
    toolName: tool.name,
    parameters: call.input as Record<string, unknown>,
    result,
    success: true,
    durationMs: Date.now() - startedAt,
  });
  return { id: call.id, isError: false, content };
}

/** O log é trilha de auditoria/depuração: falhar ao gravá-lo nunca muda o resultado que a pessoa vê. */
async function safeLogToolCall(entry: Parameters<typeof logToolCall>[0]): Promise<void> {
  try {
    await logToolCall(entry);
  } catch (error) {
    logger.error('tool_call_log_failed', { toolName: entry.toolName, userId: entry.userId, error: error instanceof Error ? error.message : String(error) });
  }
}
