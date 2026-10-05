import Anthropic from '@anthropic-ai/sdk';
import type { User } from '@zapbuddy/db';
import { logToolCall } from '@zapbuddy/db';
import { buildSystemPrompt } from './system-prompt.js';
import { getToolByName, toAnthropicToolSpecs } from './tool-registry.js';
import type { ToolContext } from './tool-types.js';
import { appendTurn, getRecentTurns } from '../context/conversation-context.js';

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const MAX_TOOL_ITERATIONS = 6;

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

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      toolResults.push(await runTool(block, toolContext));
    }
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

  await appendTurn(user.whatsapp_number, { role: 'user', content: messageText, at: new Date().toISOString() });
  await appendTurn(user.whatsapp_number, { role: 'assistant', content: finalText, at: new Date().toISOString() });

  return { replyText: finalText || 'Desculpe, não consegui processar sua mensagem agora.' };
}

async function runTool(
  block: Anthropic.ToolUseBlock,
  ctx: ToolContext,
): Promise<Anthropic.ToolResultBlockParam> {
  const tool = getToolByName(block.name);

  if (!tool) {
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
