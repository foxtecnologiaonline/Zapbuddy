import { Redis } from 'ioredis';

let cached: Redis | null = null;

export function getRedisConnection(): Redis {
  if (cached) return cached;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL must be set');

  cached = new Redis(url, { maxRetriesPerRequest: null });
  return cached;
}
