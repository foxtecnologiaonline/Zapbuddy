import { getRedisConnection } from '../redis.js';

const WINDOW_SECONDS = 60;
// Nenhum humano manda 20 mensagens de WhatsApp em 1 minuto — isto não é um
// limite esperado em uso normal, é proteção contra um número comprometido ou
// uma automação externa inundando a fila (e, no fim, a conta de LLM/Whisper).
const MAX_MESSAGES_PER_WINDOW = 20;

function key(whatsappNumber: string): string {
  return `ratelimit:msg:${whatsappNumber}`;
}

/**
 * Janela fixa simples (INCR + EXPIRE na primeira ocorrência) por número, a
 * ser checada pelos webhooks do WhatsApp antes de enfileirar qualquer
 * mensagem. Redis já é dependência obrigatória do projeto (filas/contexto),
 * então isto não introduz infraestrutura nova.
 */
export async function isRateLimited(whatsappNumber: string): Promise<boolean> {
  const redis = getRedisConnection();
  const k = key(whatsappNumber);
  const count = await redis.incr(k);
  if (count === 1) {
    await redis.expire(k, WINDOW_SECONDS);
  }
  return count > MAX_MESSAGES_PER_WINDOW;
}
