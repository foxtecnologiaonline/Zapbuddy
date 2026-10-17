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
    await logToolCall({
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

  try {
    const parsed = tool.schema.parse(call.input);
    const result = await tool.execute(parsed, ctx);
    await logToolCall({
      userId: ctx.userId,
      toolName: tool.name,
      parameters: call.input as Record<string, unknown>,
      result,
      success: true,
      durationMs: Date.now() - startedAt,
    });
    return { id: call.id, isError: false, content: JSON.stringify(result) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('tool_call_failed', { toolName: tool.name, userId: ctx.userId, error: message });
    await logToolCall({
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
}
