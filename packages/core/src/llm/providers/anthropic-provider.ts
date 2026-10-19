import Anthropic from '@anthropic-ai/sdk';
import { MESSAGES } from '../../messages.js';
import { toAnthropicToolSpecs } from '../tool-registry.js';
import { runToolCall, type ToolCallRequest } from '../tool-runner.js';
import type { LlmProvider, LlmProviderRunInput, LlmProviderRunResult } from './types.js';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const MAX_TOOL_ITERATIONS = 6;

/**
 * Sugestão #3 da revisão de performance 2026-10: Haiku 5.5 tem default
 * `medium`. Conversa curta de WhatsApp + poucas tool calls por turno é
 * exatamente o perfil que tende a responder bem a `low` (chat/triagem, não
 * coding/raciocínio longo) — custo e latência menores. NÃO validado contra
 * um eval ainda (não existe um neste projeto); monitorar qualidade das
 * respostas reais depois do deploy e subir pra `medium` de novo se piorar
 * (ex.: confirmação errada, triagem confusa entre ferramentas parecidas).
 */
const RESPONSE_EFFORT: Anthropic.Messages.MessageCreateParams['output_config'] = { effort: 'low' };

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
    // cache_control no último tool spec cacheia a lista inteira de tools
    // (idêntica em toda chamada de todo usuário).
    const cachedTools: Anthropic.Tool[] = tools.map((tool, index) =>
      index === tools.length - 1 ? { ...tool, cache_control: { type: 'ephemeral' } } : tool,
    );
    // 2 breakpoints (+ 1 nas tools acima = 3 de 4 permitidos por request):
    // `system.stable` é igual pra essa pessoa em qualquer mensagem (só muda
    // se nome/ocupação mudar) e `system.semiStable` muda no máximo algumas
    // vezes por dia — cacheando os dois, a conversa inteira do dia reusa o
    // mesmo cache em vez de invalidar tudo a cada mensagem só porque a hora
    // atual (`system.volatile`, sem cache_control, sempre no fim) mudou.
    // Antes desta rodada (sugestão #1 da revisão de performance 2026-10), o
    // prompt era uma string só com a hora interpolada no meio — cache nunca
    // reaproveitava entre mensagens da mesma conversa, só dentro do mesmo
    // turno (as até 6 iterações do loop + wrap-up).
    const cachedSystem: Anthropic.TextBlockParam[] = [
      { type: 'text', text: system.stable, cache_control: { type: 'ephemeral' } },
      ...(system.semiStable
        ? [{ type: 'text' as const, text: system.semiStable, cache_control: { type: 'ephemeral' as const } }]
        : []),
      ...(system.volatile ? [{ type: 'text' as const, text: system.volatile }] : []),
    ];

    let finalText = '';
    // true sempre que a última coisa adicionada a `messages` foi um
    // tool_result que a Claude ainda não teve chance de transformar em
    // texto (inclusive quando as iterações acabam no meio de um tool use)
    // — nesse caso ainda devemos uma chamada final.
    let pendingToolResult = false;
    // Última resposta com uso real (não a de wrap-up, que não chama tools) —
    // é o que importa pra medir custo/cache de verdade (ver sugestão #2 da
    // revisão de performance 2026-10 — orchestration.ts loga isso).
    let lastUsage: Anthropic.Usage | undefined;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
        max_tokens: 1024,
        output_config: RESPONSE_EFFORT,
        system: cachedSystem,
        messages,
        tools: cachedTools,
      });
      lastUsage = response.usage;

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
        output_config: RESPONSE_EFFORT,
        system: cachedSystem,
        messages,
      });
      lastUsage = wrapUp.usage;
      const textBlocks = wrapUp.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );
      finalText = textBlocks.map((block) => block.text).join('\n').trim();
    }

    return {
      replyText: finalText || MESSAGES.noReplyGenerated,
      usage: lastUsage && {
        inputTokens: lastUsage.input_tokens,
        outputTokens: lastUsage.output_tokens,
        cacheReadInputTokens: lastUsage.cache_read_input_tokens ?? undefined,
        cacheCreationInputTokens: lastUsage.cache_creation_input_tokens ?? undefined,
      },
    };
  },
};
