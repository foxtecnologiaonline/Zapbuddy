import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@zapbuddy/db';
import { getRedisConnection } from '@zapbuddy/core';

export const dynamic = 'force-dynamic';

async function checkDb(): Promise<boolean> {
  try {
    const { error } = await getSupabaseClient().from('users').select('id', { head: true, count: 'exact' });
    return !error;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    return (await getRedisConnection().ping()) === 'PONG';
  } catch {
    return false;
  }
}

function hasValidMetricsKey(request: NextRequest): boolean {
  const expected = process.env.HEALTH_METRICS_SECRET;
  if (!expected) return false;

  const provided = new URL(request.url).searchParams.get('key');
  if (!provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Contadores básicos (# clientes, # onboardings concluídos) só aparecem com
 * a key certa — não são dado sensível a ponto de exigir login completo, mas
 * também não devem ficar públicos pra qualquer um que ache a URL do health.
 */
async function getMetrics(): Promise<{ totalUsers: number; onboardedUsers: number }> {
  const supabase = getSupabaseClient();
  const [usersResult, onboardedResult] = await Promise.all([
    supabase.from('users').select('id', { head: true, count: 'exact' }),
    supabase.from('users').select('id', { head: true, count: 'exact' }).not('onboarding_completed_at', 'is', null),
  ]);
  return { totalUsers: usersResult.count ?? 0, onboardedUsers: onboardedResult.count ?? 0 };
}

/** Liveness básico (DB + Redis) pra monitorar sem precisar ler log — e contadores opcionais com ?key=. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const [dbOk, redisOk] = await Promise.all([checkDb(), checkRedis()]);
  const healthy = dbOk && redisOk;

  const body: Record<string, unknown> = {
    status: healthy ? 'ok' : 'degraded',
    checks: { db: dbOk, redis: redisOk },
  };

  if (hasValidMetricsKey(request)) {
    body.metrics = await getMetrics().catch(() => null);
  }

  return NextResponse.json(body, { status: healthy ? 200 : 503 });
}
