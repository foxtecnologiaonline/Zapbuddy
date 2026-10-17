import { getSupabaseClient } from '../client.js';
import type { Budget } from '../types.js';

/** Um limite por (conta, categoria) — pedir de novo pra mesma categoria substitui o anterior. */
export async function upsertBudget(accountId: string, category: string, limitCents: number): Promise<Budget> {
  const { data, error } = await getSupabaseClient()
    .from('budgets')
    .upsert({ account_id: accountId, category, limit_cents: limitCents }, { onConflict: 'account_id,category' })
    .select('*')
    .single();

  if (error) throw error;
  return data as Budget;
}

export async function getBudget(accountId: string, category: string): Promise<Budget | null> {
  const { data, error } = await getSupabaseClient()
    .from('budgets')
    .select('*')
    .eq('account_id', accountId)
    .eq('category', category)
    .maybeSingle();

  if (error) throw error;
  return (data as Budget | null) ?? null;
}
