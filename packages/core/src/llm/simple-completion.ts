import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { logger } from '@zapbuddy/db';

/**
 * Completação de texto simples (sem tools) para tarefas internas curtas — hoje,
 * só o resumo rolante da conversa. Mesma ordem de providers do resto do
 * sistema: Anthropic primeiro, OpenAI só se a Anthropic falhar.
 */

const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

export interface SimpleCompletionInput {
  system: string;
  user: string;
  maxTokens: number;
}

async function viaAnthropic(input: SimpleCompletionInput): Promise<string> {
  anthropicClient ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropicClient.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
    max_tokens: input.maxTokens,
    system: input.system,
    messages: [{ role: 'user', content: input.user }],
  });
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

async function viaOpenAi(input: SimpleCompletionInput): Promise<string> {
  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openaiClient.chat.completions.create({
    model: process.env.OPENAI_FALLBACK_MODEL ?? DEFAULT_OPENAI_MODEL,
    max_tokens: input.maxTokens,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.user },
    ],
  });
  return response.choices[0]?.message.content?.trim() ?? '';
}

/** Texto gerado, ou lança se nenhum provider configurado respondeu. */
export async function completeText(input: SimpleCompletionInput): Promise<string> {
  const errors: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const text = await viaAnthropic(input);
      if (text) return text;
      errors.push('anthropic: resposta vazia');
    } catch (error) {
      errors.push(`anthropic: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (process.env.OPENAI_API_KEY) {
    try {
      const text = await viaOpenAi(input);
      if (text) return text;
      errors.push('openai: resposta vazia');
    } catch (error) {
      errors.push(`openai: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  logger.warn('simple_completion_failed', { errors });
  throw new Error(`Nenhum provider de LLM respondeu (${errors.join('; ') || 'nenhum configurado'})`);
}
