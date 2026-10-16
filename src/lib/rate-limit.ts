import { getRedis } from './redis';

const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_LIMIT = 20;

/**
 * Janela fixa via INCR+EXPIRE: simples e barata (2 comandos Redis), sem a
 * precisão de uma janela deslizante — suficiente pra conter flood/abuso,
 * que é o objetivo aqui (não billing nem rate limit de API pública).
 */
export async function isRateLimited(
  key: string,
  limit = DEFAULT_LIMIT,
  windowSeconds = DEFAULT_WINDOW_SECONDS,
): Promise<boolean> {
  const redis = getRedis();
  const redisKey = `rate-limit:${key}`;

  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }

  return count > limit;
}
