import OpenAI from 'openai';
import { logger } from '@zapbuddy/db';

const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/**
 * Reaproveita OPENAI_API_KEY, já presente no projeto pro fallback de LLM e
 * de transcrição (mesmo padrão de reúso de chave do CLAUDE.md) — nenhuma
 * credencial nova só pra isso. Retorna null em vez de lançar erro quando a
 * chave não está configurada ou a chamada falha: embedding é um bônus pra
 * recuperação por similaridade (RAG), nunca deve derrubar a busca/tool call
 * que está rodando por cima dele — ver web-search/client.ts.
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const response = await getClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0]?.embedding ?? null;
  } catch (error) {
    logger.error('embed_text_failed', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
