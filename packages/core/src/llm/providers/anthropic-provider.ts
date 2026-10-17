import Anthropic from '@anthropic-ai/sdk';
import { MESSAGES } from '../../messages.js';
import { toAnthropicToolSpecs } from '../tool-registry.js';
import { runToolCall, type ToolCallRequest } from '../tool-runner.js';
import type { LlmProvider, LlmProviderRunInput, LlmProviderRunResult } from './types.js';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const MAX_TOOL_ITERATIONS = 6;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  return client;
}

/** Provider primário — Claude via tool use (ver CLAUDE.md: decisão de stack). */
export const anthropicProvider: LlmProvider = {
  name: 'anthropic',

  isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  },

  async run(input: LlmProviderRunInput): Promise<LlmProviderRunResult> {
    const { system, history, userMessage, toolContext } = input;

    const messages: Anthropic.MessageParam[] = history.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));
    messages.push({ role: 'user', content: userMessage });

    const anthropic = getClient();
    const tools = toAnthropicToolSpecs();
    // cache_control no último tool spec cacheia a lista inteira de tools (16
    // schemas, idêntica em toda chamada de todo usuário) — e no bloco de
    // system cacheia o prompt (idêntico dentro do mesmo turno: é montado uma
    // vez por orchestrateTurn e reusado nas até 6 iterações do loop + no
    // wrap-up abaixo). Ambos cobrem sozinhos >1024 tokens (mínimo da
    // Anthropic pra cachear), então o ganho vale mesmo sem hit entre turnos
    // diferentes. Ver suggestion #1 da revisão de performance.
    const cachedTools: Anthropic.Tool[] = tools.map((tool, index) =>
      index === tools.length - 1 ? { ...tool, cache_control: { type: 'ephemeral' } } : tool,
    );
    const cachedSystem: Anthropic.TextBlockParam[] = [
      { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
    ];

    let finalText = '';
    // true sempre que a última coisa adicionada a `messages` foi um
    // tool_result que a Claude ainda não teve chance de transformar em
    // texto (inclusive quando as iterações acabam no meio de um tool use)
    // — nesse caso ainda devemos uma chamada final.
    let pendingToolResult = false;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
        max_tokens: 1024,
        system: cachedSystem,
        messages,
        tools: cachedTools,
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

      // Em paralelo: são chamadas independentes e tool_use_id já religa
      // cada resultado ao bloco certo, então a ordem de término não importa.
      const outcomes = await Promise.all(
        toolUseBlocks.map((block) =>
          runToolCall({ id: block.id, name: block.name, input: block.input } satisfies ToolCallRequest, toolContext),
        ),
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = outcomes.map((outcome) => ({
        type: 'tool_result',
        tool_use_id: outcome.id,
        is_error: outcome.isError,
        content: outcome.content,
      }));
      messages.push({ role: 'user', content: toolResults });
      pendingToolResult = true;

      if (response.stop_reason !== 'tool_use') {
        break;
      }
    }

    if (pendingToolResult) {
      // Loop de tool-use cortado (máximo de iterações) logo depois de
      // executar uma tool — a ação já aconteceu, então pede pra Claude
      // resumir em texto em vez de dizer ao usuário que falhou. Sem
      // `tools` aqui: queremos uma resposta final, não outra tool call.
      const wrapUp = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
        max_tokens: 1024,
        system: cachedSystem,
        messages,
      });
      const textBlocks = wrapUp.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );
      finalText = textBlocks.map((block) => block.text).join('\n').trim();
    }

    return { replyText: finalText || MESSAGES.noReplyGenerated };
  },
};
