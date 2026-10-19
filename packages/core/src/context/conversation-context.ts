import { getRedisConnection } from '../redis.js';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

// Esticado de 20/6h (2026-10, pedido explícito do dono do produto) — bem
// diferente do incidente de overhead do Redis na mesma época: essa chave já
// tem teto fixo (LTRIM) + EXPIRE em toda escrita, sem crescimento ilimitado,
// então aumentar o teto não reintroduz aquele problema (que era polling de
// infra ociosa, não esta chave).
const MAX_TURNS = 40;
const TTL_SECONDS = 60 * 60 * 24; // 24h de inatividade encerra o contexto curto prazo
// Uma nota de voz longa transcrita ocuparia o contexto inteiro sozinha e seria
// reenviada por completo em todo turno seguinte, inflando tokens/custo sem
// ganho real de memória conversacional — trunca o que sobra do que o modelo
// já respondeu/leu na hora.
const MAX_TURN_CONTENT_CHARS = 4000;

function key(whatsappNumber: string): string {
  return `conversation:${whatsappNumber}`;
}

function truncate(content: string): string {
  return content.length > MAX_TURN_CONTENT_CHARS
    ? `${content.slice(0, MAX_TURN_CONTENT_CHARS)}… [truncado]`
    : content;
}

/**
 * Contexto de conversa de curto prazo — camada separada dos dados estruturados
 * de longo prazo (Postgres). Vive em Redis com TTL; nunca é a fonte de verdade
 * para transações/tarefas, só dá ao LLM memória recente da conversa.
 */
export async function appendTurn(whatsappNumber: string, turn: ConversationTurn): Promise<void> {
  const redis = getRedisConnection();
  const k = key(whatsappNumber);
  const toStore: ConversationTurn = { ...turn, content: truncate(turn.content) };
  // multi() faz as 3 operações num round-trip atômico — separadas, um crash
  // entre elas podia deixar a chave sem TTL (vazamento no Redis) ou perder um
  // ltrim em appendTurn concorrente para o mesmo número.
  await redis.multi().rpush(k, JSON.stringify(toStore)).ltrim(k, -MAX_TURNS, -1).expire(k, TTL_SECONDS).exec();
}

export async function getRecentTurns(whatsappNumber: string): Promise<ConversationTurn[]> {
  const redis = getRedisConnection();
  const raw = await redis.lrange(key(whatsappNumber), 0, -1);
  return raw.map((item) => JSON.parse(item) as ConversationTurn);
}

export async function clearConversation(whatsappNumber: string): Promise<void> {
  await getRedisConnection().del(key(whatsappNumber));
}
