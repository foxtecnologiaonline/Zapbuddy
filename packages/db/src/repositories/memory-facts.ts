import { getSupabaseClient } from '../client.js';
import type { MemoryFact } from '../types.js';

export async function createMemoryFact(accountId: string, userId: string, fact: string): Promise<MemoryFact> {
  const { data, error } = await getSupabaseClient()
    .from('memory_facts')
    .insert({ account_id: accountId, created_by_user_id: userId, fact })
    .select('*')
    .single();

  if (error) throw error;
  return data as MemoryFact;
}

const DEFAULT_MEMORY_FACTS_LIMIT = 30;

/**
 * `limit` existe pelo mesmo motivo de `listTasks`: isto alimenta o system
 * prompt (via orchestrator) — sem teto, uma conta antiga com muitos fatos
 * vira custo de token crescente a cada conversa.
 */
export async function listMemoryFacts(accountId: string, limit: number = DEFAULT_MEMORY_FACTS_LIMIT): Promise<MemoryFact[]> {
  const { data, error } = await getSupabaseClient()
    .from('memory_facts')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as MemoryFact[];
}

/** Remove de verdade — mesmo raciocínio de deleteTask, "esquecer" não tem valor histórico pra manter. */
export async function deleteMemoryFact(accountId: string, factId: string): Promise<MemoryFact | null> {
  const { data, error } = await getSupabaseClient()
    .from('memory_facts')
    .delete()
    .eq('id', factId)
    .eq('account_id', accountId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as MemoryFact | null) ?? null;
}
