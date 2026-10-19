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
 *
 * Recebe uma ou mais turnos (o orquestrador sempre manda o par usuário+Tom
 * junto, ver orchestrator.ts) num ÚNICO round-trip — análise de consumo de
 * Redis 2026-10 (ver CLAUDE.md, incidente de cota do Upstash): isto roda em
 * TODA mensagem, sem exceção, então é a operação de maior frequência do
 * sistema; mandar os dois turnos separados dobrava à toa o número de comandos
 * dessa chamada específica.
 */
export async function appendTurns(whatsappNumber: string, turns: ConversationTurn[]): Promise<void> {
  if (turns.length === 0) return;

  const redis = getRedisConnection();
  const k = key(whatsappNumber);
  let pipeline = redis.multi();
  for (const turn of turns) {
    const toStore: ConversationTurn = { ...turn, content: truncate(turn.content) };
    pipeline = pipeline.rpush(k, JSON.stringify(toStore));
  }
  // ltrim/expire uma vez só, depois de todos os rpush — mesmo raciocínio do
  // multi() original: separados, um crash no meio podia deixar a chave sem
  // TTL (vazamento no Redis) ou perder um ltrim em escrita concorrente para
  // o mesmo número.
  await pipeline.ltrim(k, -MAX_TURNS, -1).expire(k, TTL_SECONDS).exec();
}

export async function getRecentTurns(whatsappNumber: string): Promise<ConversationTurn[]> {
  const redis = getRedisConnection();
  const raw = await redis.lrange(key(whatsappNumber), 0, -1);
  return raw.map((item) => JSON.parse(item) as ConversationTurn);
}

export async function clearConversation(whatsappNumber: string): Promise<void> {
  await getRedisConnection().del(key(whatsappNumber));
}
