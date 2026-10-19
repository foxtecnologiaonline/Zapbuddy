import { Redis } from 'ioredis';
import { logger } from '@zapbuddy/db';

let cached: Redis | null = null;

export function getRedisConnection(): Redis {
  if (cached) return cached;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL must be set');

  cached = new Redis(url, { maxRetriesPerRequest: null });
  // Sem isso, erro de conexão (ex.: estouro de limite do provider, credencial
  // trocada) só aparecia como warning solto do ioredis no console, sem rastro
  // estruturado — foi exatamente o que dificultou diagnosticar o incidente de
  // 2026-10 (ver CLAUDE.md). Loga, não derruba: a própria lib já tenta
  // reconectar sozinha.
  cached.on('error', (error) => {
    logger.error('redis_connection_error', { error: error.message });
  });
  return cached;
}

/** Usado só pelo card "Infraestrutura" do admin pra checar se o Redis está alcançável. */
export async function pingRedis(): Promise<boolean> {
  try {
    const reply = await getRedisConnection().ping();
    return reply === 'PONG';
  } catch {
    return false;
  }
}

const WORKER_HEARTBEAT_KEY = 'zapbuddy:worker:heartbeat';
// 3x o intervalo de escrita (ver HEARTBEAT_INTERVAL_MS em apps/worker/src/worker.ts) — folga pra um
// ciclo atrasado não aparecer como "offline" no admin por um falso alarme.
const WORKER_HEARTBEAT_STALE_MS = 6 * 60 * 60_000; // 6h

/** Chamado só pelo processo do worker, periodicamente — ver apps/worker/src/worker.ts. */
export async function writeWorkerHeartbeat(): Promise<void> {
  await getRedisConnection().set(WORKER_HEARTBEAT_KEY, Date.now().toString());
}

/** Usado pelo card de status do admin: null = nunca rodou (ou Redis inacessível), senão idade em ms do último heartbeat. */
export async function getWorkerHeartbeatAgeMs(): Promise<number | null> {
  try {
    const value = await getRedisConnection().get(WORKER_HEARTBEAT_KEY);
    if (!value) return null;
    return Date.now() - Number(value);
  } catch {
    return null;
  }
}

/**
 * Pura por design (recebe a idade em vez de buscar sozinha) — o card de
 * status do admin já precisa de `getWorkerHeartbeatAgeMs()` pra exibir "há
 * Xmin", então calcular a saúde a partir desse mesmo valor evita um segundo
 * GET no Redis pra responder a mesma pergunta duas vezes (ver análise de
 * consumo de Redis 2026-10, CLAUDE.md).
 */
export function isHeartbeatFresh(ageMs: number | null): boolean {
  return ageMs !== null && ageMs <= WORKER_HEARTBEAT_STALE_MS;
}
