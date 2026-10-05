import { getRedisConnection } from '../redis.js';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

const MAX_TURNS = 20;
const TTL_SECONDS = 60 * 60 * 6; // 6h de inatividade encerra o contexto curto prazo

function key(whatsappNumber: string): string {
  return `conversation:${whatsappNumber}`;
}

/**
 * Contexto de conversa de curto prazo — camada separada dos dados estruturados
 * de longo prazo (Postgres). Vive em Redis com TTL; nunca é a fonte de verdade
 * para transações/tarefas, só dá ao LLM memória recente da conversa.
 */
export async function appendTurn(whatsappNumber: string, turn: ConversationTurn): Promise<void> {
  const redis = getRedisConnection();
  const k = key(whatsappNumber);
  await redis.rpush(k, JSON.stringify(turn));
  await redis.ltrim(k, -MAX_TURNS, -1);
  await redis.expire(k, TTL_SECONDS);
}

export async function getRecentTurns(whatsappNumber: string): Promise<ConversationTurn[]> {
  const redis = getRedisConnection();
  const raw = await redis.lrange(key(whatsappNumber), 0, -1);
  return raw.map((item) => JSON.parse(item) as ConversationTurn);
}

export async function clearConversation(whatsappNumber: string): Promise<void> {
  await getRedisConnection().del(key(whatsappNumber));
}
