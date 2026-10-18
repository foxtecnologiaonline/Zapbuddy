import { getSupabaseClient } from '../client.js';

/**
 * Tabelas cujo tamanho total interessa pro card "Infraestrutura" do admin.
 * Lista fechada (não um nome de tabela livre) pra não abrir brecha de
 * injeção via `.from(table)` com entrada não confiável.
 */
const COUNTABLE_TABLES = [
  'users',
  'transactions',
  'tasks',
  'reminders',
  'tool_call_logs',
  'webhook_events',
  'error_logs',
] as const;

export type CountableTable = (typeof COUNTABLE_TABLES)[number];

/** Usado só pelo card de status do admin — nunca lança, só diz se o banco respondeu. */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const { error } = await getSupabaseClient().from('users').select('id', { head: true, count: 'exact' }).limit(1);
    return !error;
  } catch {
    return false;
  }
}

export async function countAllRows(): Promise<Record<CountableTable, number>> {
  const client = getSupabaseClient();
  const results = await Promise.all(
    COUNTABLE_TABLES.map(async (table) => {
      const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
      if (error) throw error;
      return [table, count ?? 0] as const;
    }),
  );

  return Object.fromEntries(results) as Record<CountableTable, number>;
}
