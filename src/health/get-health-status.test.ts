import { describe, it, expect } from 'vitest';
import { getHealthStatus } from './get-health-status';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Redis } from 'ioredis';

function fakeSupabase(countsByStatus: Record<string, number>, error: unknown = null) {
  const builder = {
    from: () => builder,
    select: () => builder,
    eq: (_col: string, status: string) =>
      Promise.resolve({ data: null, error, count: countsByStatus[status] ?? 0 }),
    then: (resolve: (value: { data: null; error: unknown; count: number }) => void) =>
      resolve({ data: null, error, count: countsByStatus.total ?? 0 }),
  };
  return builder as unknown as SupabaseClient;
}

function fakeRedis(ok: boolean): Redis {
  return {
    ping: async () => {
      if (!ok) throw new Error('ECONNREFUSED');
      return 'PONG';
    },
  } as unknown as Redis;
}

describe('getHealthStatus', () => {
  it('status ok quando supabase e redis respondem, contadores populados', async () => {
    const result = await getHealthStatus({
      supabase: fakeSupabase({ total: 10, active: 7, onboarding: 3 }),
      redis: fakeRedis(true),
    });

    expect(result.status).toBe('ok');
    expect(result.checks).toEqual({ supabase: 'ok', redis: 'ok' });
    expect(result.counters).toEqual({ totalClients: 10, activeClients: 7, onboardingClients: 3 });
  });

  it('degraded quando supabase falha, contadores zerados', async () => {
    const result = await getHealthStatus({
      supabase: fakeSupabase({}, new Error('connection refused')),
      redis: fakeRedis(true),
    });

    expect(result.status).toBe('degraded');
    expect(result.checks.supabase).toBe('error');
    expect(result.counters).toEqual({ totalClients: 0, activeClients: 0, onboardingClients: 0 });
  });

  it('degraded quando redis falha, mas contadores ainda vêm do supabase', async () => {
    const result = await getHealthStatus({
      supabase: fakeSupabase({ total: 5, active: 2, onboarding: 3 }),
      redis: fakeRedis(false),
    });

    expect(result.status).toBe('degraded');
    expect(result.checks.redis).toBe('error');
    expect(result.counters).toEqual({ totalClients: 5, activeClients: 2, onboardingClients: 3 });
  });
});
