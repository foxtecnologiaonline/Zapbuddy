import type { SupabaseClient } from '@supabase/supabase-js';
import type { Redis } from 'ioredis';
import { supabase } from '../lib/supabase';
import { getRedis } from '../lib/redis';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  checks: { supabase: 'ok' | 'error'; redis: 'ok' | 'error' };
  counters: { totalClients: number; activeClients: number; onboardingClients: number };
  timestamp: string;
}

async function checkSupabase(client: SupabaseClient): Promise<'ok' | 'error'> {
  try {
    const { error } = await client.from('clients').select('id', { head: true, count: 'exact' });
    return error ? 'error' : 'ok';
  } catch {
    return 'error';
  }
}

async function checkRedis(redis: Redis): Promise<'ok' | 'error'> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG' ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

async function countClients(client: SupabaseClient, status?: 'active' | 'onboarding'): Promise<number> {
  let query = client.from('clients').select('*', { count: 'exact', head: true });
  if (status) query = query.eq('status', status);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Checa Supabase + Redis e devolve contadores básicos de clientes. Deps
 * injetáveis pra testar os caminhos de erro sem precisar derrubar o
 * Supabase/Redis de verdade; em produção roda com os clients reais.
 */
export async function getHealthStatus(
  deps: { supabase?: SupabaseClient; redis?: Redis } = {},
): Promise<HealthStatus> {
  const supabaseClient = deps.supabase ?? supabase;
  const redisClient = deps.redis ?? getRedis();

  const [supabaseStatus, redisStatus] = await Promise.all([
    checkSupabase(supabaseClient),
    checkRedis(redisClient),
  ]);

  let counters = { totalClients: 0, activeClients: 0, onboardingClients: 0 };

  if (supabaseStatus === 'ok') {
    const [totalClients, activeClients, onboardingClients] = await Promise.all([
      countClients(supabaseClient),
      countClients(supabaseClient, 'active'),
      countClients(supabaseClient, 'onboarding'),
    ]);
    counters = { totalClients, activeClients, onboardingClients };
  }

  return {
    status: supabaseStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded',
    checks: { supabase: supabaseStatus, redis: redisStatus },
    counters,
    timestamp: new Date().toISOString(),
  };
}
