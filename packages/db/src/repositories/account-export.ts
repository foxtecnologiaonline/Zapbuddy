import { getSupabaseClient } from '../client.js';

/**
 * Tudo que a conta registrou, pra download pela própria pessoa (portabilidade).
 * Só tabelas de dado que a pessoa criou — sem tokens, sem logs de sistema.
 */
export async function exportAccountData(accountId: string): Promise<Record<string, unknown[]>> {
  const client = getSupabaseClient();
  const tables = ['transactions', 'tasks', 'notes', 'recurring_bills', 'goals', 'memory_facts'] as const;

  const results = await Promise.all(
    tables.map(async (table) => {
      const { data, error } = await client.from(table).select('*').eq('account_id', accountId).order('created_at', { ascending: true });
      if (error) throw error;
      return [table, data ?? []] as const;
    }),
  );

  return Object.fromEntries(results);
}
