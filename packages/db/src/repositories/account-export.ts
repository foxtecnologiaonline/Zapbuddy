import { getSupabaseClient } from '../client.js';

/**
 * Tudo que a conta registrou, pra download pela própria pessoa (portabilidade).
 * Só tabelas de dado que a pessoa criou — sem tokens, sem logs de sistema.
 */
export async function exportAccountData(accountId: string): Promise<Record<string, unknown[]>> {
  const client = getSupabaseClient();
  const tables = [
    'transactions',
    'tasks',
    'reminders',
    'notes',
    'memory_facts',
    'important_dates',
    'personal_goals',
    'recurring_bills',
    'goals',
    'habits',
    'habit_checkins',
    'contacts',
    'message_drafts',
  ] as const;

  const results = await Promise.all(
    tables.map(async (table) => {
      // notes tem coluna de vetor (embedding) — nunca vai pro arquivo de portabilidade.
      const columns = table === 'notes' ? 'id, account_id, content, created_by_user_id, created_at' : '*';
      const { data, error } = await client.from(table).select(columns).eq('account_id', accountId).order('created_at', { ascending: true });
      if (error) throw error;
      return [table, data ?? []] as const;
    }),
  );

  return Object.fromEntries(results);
}
