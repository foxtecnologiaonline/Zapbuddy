import { Redis } from 'ioredis';

let cached: Redis | null = null;

export function getRedisConnection(): Redis {
  if (cached) return cached;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL must be set');

  cached = new Redis(url, { maxRetriesPerRequest: null });
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
// 3x o intervalo de escrita (ver apps/worker/src/worker.ts) — folga pra um
// ciclo atrasado não aparecer como "offline" no admin por um falso alarme.
const WORKER_HEARTBEAT_STALE_MS = 90_000;

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

export async function isWorkerHealthy(): Promise<boolean> {
  const age = await getWorkerHeartbeatAgeMs();
  return age !== null && age <= WORKER_HEARTBEAT_STALE_MS;
}
