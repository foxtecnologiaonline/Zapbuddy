import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionToolMessageParam } from 'openai/resources/chat/completions';
import type { CompletionUsage } from 'openai/resources/completions';
import { MESSAGES } from '../../messages.js';
import { toOpenAiToolSpecs } from '../tool-registry.js';
import { runToolCall, type ToolCallRequest } from '../tool-runner.js';
import type { LlmProvider, LlmProviderRunInput, LlmProviderRunResult } from './types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_TOOL_ITERATIONS = 6;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/**
 * Provider de fallback — só entra quando o Anthropic falha (ver
 * providers/orchestration.ts). Reaproveita `OPENAI_API_KEY`, já configurada
 * no projeto pro fallback de transcrição de áudio (apps/worker) — mesmo
 * padrão do mycollect, que reaproveita a chave entre features em vez de
 * pedir um segredo novo por integração.
 */
export const openaiProvider: LlmProvider = {
  name: 'openai',

  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  },

  async run(input: LlmProviderRunInput): Promise<LlmProviderRunResult> {
    const { system, history, userMessage, toolContext } = input;

    // OpenAI cacheia prefixo automaticamente no servidor (sem cache_control
    // explícito) — concatenar as 3 camadas na ordem estável→semi-estável→
    // volátil (mesma ordem usada pelos breakpoints do provider Anthropic)
    // já aproveita isso, sem precisar de nada específico desta API.
    const systemText = `${system.stable}${system.semiStable}${system.volatile}`;
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemText },
      ...history.map((turn) => ({ role: turn.role, content: turn.content }) as ChatCompletionMessageParam),
      { role: 'user', content: userMessage },
    ];

    const openai = getClient();
    const tools = toOpenAiToolSpecs();
    const model = process.env.OPENAI_FALLBACK_MODEL ?? DEFAULT_MODEL;

    let finalText = '';
    let pendingToolResult = false;
    let lastUsage: CompletionUsage | undefined;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const response = await openai.chat.completions.create({ model, messages, tools, tool_choice: 'auto' });
      lastUsage = response.usage;
      const choice = response.choices[0];
      if (!choice) throw new Error('OpenAI não retornou nenhum choice');
      const toolCalls = choice.message.tool_calls?.filter((call) => call.type === 'function') ?? [];
      finalText = choice.message.content?.trim() ?? '';

      if (toolCalls.length === 0) {
        pendingToolResult = false;
        break;
      }

      messages.push({ role: 'assistant', content: choice.message.content, tool_calls: toolCalls });

      // Em paralelo, mesma lógica do provider Anthropic — chamadas
      // independentes, cada resultado religado pelo tool_call_id.
      const outcomes = await Promise.all(
        toolCalls.map((call) => {
          const request: ToolCallRequest = { id: call.id, name: call.function.name, input: parseArguments(call.function.arguments) };
          return runToolCall(request, toolContext);
        }),
      );
      const toolResults: ChatCompletionToolMessageParam[] = outcomes.map((outcome) => ({
        role: 'tool',
        tool_call_id: outcome.id,
        content: outcome.isError ? `ERRO: ${outcome.content}` : outcome.content,
      }));
      messages.push(...toolResults);
      pendingToolResult = true;

      if (choice.finish_reason !== 'tool_calls') {
        break;
      }
    }

    if (pendingToolResult) {
      // Mesmo raciocínio do provider Anthropic: loop cortado logo após
      // executar uma tool — pede resumo em texto, sem tools, em vez de
      // devolver vazio.
      const wrapUp = await openai.chat.completions.create({ model, messages });
      lastUsage = wrapUp.usage;
      finalText = wrapUp.choices[0]?.message.content?.trim() ?? '';
    }

    return {
      replyText: finalText || MESSAGES.noReplyGenerated,
      // Chat Completions não devolve cache_read/cache_creation separado
      // (caching da OpenAI é automático e opaco) — só input/output mesmo.
      usage: lastUsage && { inputTokens: lastUsage.prompt_tokens, outputTokens: lastUsage.completion_tokens },
    };
  },
};

/**
 * `function.arguments` chega como string JSON — nunca confiar em parsing
 * manual/regex: o modelo pode produzir JSON ligeiramente diferente do que
 * se espera (ver nota equivalente sobre tool calls da Anthropic).
 */
function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
