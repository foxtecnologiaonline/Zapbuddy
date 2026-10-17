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
