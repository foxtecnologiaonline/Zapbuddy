import Anthropic from '@anthropic-ai/sdk';
import type { User } from '@zapbuddy/db';
import { logToolCall, logger } from '@zapbuddy/db';
import { buildSystemPrompt } from './system-prompt.js';
import { getToolByName, toAnthropicToolSpecs } from './tool-registry.js';
import type { ToolContext } from './tool-types.js';
import { appendTurn, getRecentTurns } from '../context/conversation-context.js';
import { MESSAGES } from '../messages.js';
import { sendWhatsappTextMessage } from '../whatsapp/channel.js';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const MAX_TOOL_ITERATIONS = 6;
// Nenhum timeout aborta o processamento — só avisa o usuário que o bot ainda
// está vendo a mensagem, pra silêncio (ex.: Supabase/Anthropic engasgando)
// não parecer que o bot sumiu. 8s é bem acima da latência normal de 1
// iteração (1 chamada à Claude + tools), então só dispara em turno
// realmente lento, não em toda mensagem.
export const INTERIM_NOTICE_MS = 8_000;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  return client;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

export interface OrchestrateInput {
  user: User;
  messageText: string;
  messageSource: 'text' | 'audio';
}

export interface OrchestrateResult {
  replyText: string;
}

/**
 * Runs one WhatsApp turn through Claude with tool use: builds context from the
 * short-term conversation history + system prompt, executes any tool calls the
 * model makes (logging every one), and returns the final text reply.
 */
export async function orchestrateTurn(input: OrchestrateInput): Promise<OrchestrateResult> {
  const { user, messageText, messageSource } = input;
  const toolContext: ToolContext = {
    userId: user.id,
    whatsappNumber: user.whatsapp_number,
    messageSource,
    timezone: user.timezone,
  };

  const history = await getRecentTurns(user.whatsapp_number);
  const messages: Anthropic.MessageParam[] = history.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));
  messages.push({ role: 'user', content: messageText });

  const anthropic = getClient();
  const tools = toAnthropicToolSpecs();
  const system = buildSystemPrompt(user);

  let finalText = '';
  // true whenever the last thing added to `messages` was a tool_result that
  // Claude hasn't had a chance to turn into text yet (including when we run
  // out of iterations mid tool-use) — in that case we owe one more call.
  let pendingToolResult = false;

  // Só dispara se o turno inteiro (todas as iterações + wrap-up) ainda não
  // tiver terminado em INTERIM_NOTICE_MS — cancelado no finally abaixo assim
  // que há uma resposta real pra enviar.
  let interimTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    interimTimer = null;
    void sendWhatsappTextMessage(user.whatsapp_number, MESSAGES.stillProcessing).catch((error) => {
      logger.error('interim_notice_failed', {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, INTERIM_NOTICE_MS);

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
        max_tokens: 1024,
        system,
        messages,
        tools,
      });

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );
      finalText = textBlocks.map((block) => block.text).join('\n').trim();

      if (toolUseBlocks.length === 0) {
        pendingToolResult = false;
        break;
      }

      messages.push({ role: 'assistant', content: response.content });

      // Em paralelo: são chamadas independentes (ex.: gasto + tarefa na mesma
      // mensagem, que o system prompt explicitamente pede pra resolver junto) e
      // tool_use_id já religa cada resultado ao bloco certo, então a ordem de
      // término não importa.
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map((block) => runTool(block, toolContext)),
      );
      messages.push({ role: 'user', content: toolResults });
      pendingToolResult = true;

      if (response.stop_reason !== 'tool_use') {
        break;
      }
    }

    if (pendingToolResult) {
      // Tool-use loop was cut off (max iterations) right after executing a
      // tool — the action already happened, so get Claude to summarize it in
      // text rather than telling the user we failed. No `tools` here: we want
      // a final answer, not another tool call.
      const wrapUp = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
        max_tokens: 1024,
        system,
        messages,
      });
      const textBlocks = wrapUp.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );
      finalText = textBlocks.map((block) => block.text).join('\n').trim();
    }
  } finally {
    if (interimTimer) clearTimeout(interimTimer);
  }

  // Calculado ANTES de salvar no contexto: se finalText vier vazio (ex.: o
  // wrap-up também não retornou texto), o que fica salvo como turno do
  // assistente tem que ser o mesmo texto que o usuário realmente recebeu
  // (o fallback), nunca uma string vazia — senão o próximo turno lê um
  // histórico que não reflete o que de fato foi dito na conversa.
  const replyText = finalText || MESSAGES.noReplyGenerated;

  await appendTurn(user.whatsapp_number, { role: 'user', content: messageText, at: new Date().toISOString() });
  await appendTurn(user.whatsapp_number, { role: 'assistant', content: replyText, at: new Date().toISOString() });

  return { replyText };
}

async function runTool(
  block: Anthropic.ToolUseBlock,
  ctx: ToolContext,
): Promise<Anthropic.ToolResultBlockParam> {
  const tool = getToolByName(block.name);

  if (!tool) {
    logger.error('tool_call_failed', { toolName: block.name, userId: ctx.userId, error: 'unknown tool' });
    await logToolCall({
      userId: ctx.userId,
      toolName: block.name,
      parameters: (block.input as Record<string, unknown>) ?? {},
      result: null,
      success: false,
      error: 'unknown tool',
    });
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      is_error: true,
      content: `Tool desconhecida: ${block.name}`,
    };
  }

  try {
    const parsed = tool.schema.parse(block.input);
    const result = await tool.execute(parsed, ctx);
    await logToolCall({
      userId: ctx.userId,
      toolName: tool.name,
      parameters: block.input as Record<string, unknown>,
      result,
      success: true,
    });
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      content: JSON.stringify(result),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // tool_call_logs registra isso no banco, mas ninguém olha lá ativamente
    // — este log estruturado é o que torna a falha visível (buscável/com
    // alerta configurável) nos logs padrão do Vercel/host do worker, sem
    // depender de um serviço de alerta novo.
    logger.error('tool_call_failed', { toolName: tool.name, userId: ctx.userId, error: message });
    await logToolCall({
      userId: ctx.userId,
      toolName: tool.name,
      parameters: (block.input as Record<string, unknown>) ?? {},
      result: null,
      success: false,
      error: message,
    });
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      is_error: true,
      content: `Erro ao executar ${tool.name}: ${message}`,
    };
  }
}
