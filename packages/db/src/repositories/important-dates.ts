import { getSupabaseClient } from '../client.js';
import type { ImportantDate } from '../types.js';

export async function createImportantDate(
  accountId: string,
  userId: string,
  label: string,
  month: number,
  day: number,
): Promise<ImportantDate> {
  const { data, error } = await getSupabaseClient()
    .from('important_dates')
    .insert({ account_id: accountId, created_by_user_id: userId, label, month, day })
    .select('*')
    .single();

  if (error) throw error;
  return data as ImportantDate;
}

const DEFAULT_IMPORTANT_DATES_LIMIT = 50;

export async function listImportantDates(accountId: string, limit: number = DEFAULT_IMPORTANT_DATES_LIMIT): Promise<ImportantDate[]> {
  const { data, error } = await getSupabaseClient()
    .from('important_dates')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ImportantDate[];
}

/**
 * Usado só pelo sweep horário do worker (insights-sweep.ts) pra checar se
 * ALGUMA data importante dessa conta cai no dia de hoje (no fuso dela) —
 * normalmente 0 ou 1 resultado por conta/dia.
 */
export async function listImportantDatesForAccountOnDate(accountId: string, month: number, day: number): Promise<ImportantDate[]> {
  const { data, error } = await getSupabaseClient()
    .from('important_dates')
    .select('*')
    .eq('account_id', accountId)
    .eq('month', month)
    .eq('day', day);

  if (error) throw error;
  return (data ?? []) as ImportantDate[];
}

/** Remove de verdade — mesmo raciocínio de deleteNote/deleteMemoryFact. */
export async function deleteImportantDate(accountId: string, importantDateId: string): Promise<ImportantDate | null> {
  const { data, error } = await getSupabaseClient()
    .from('important_dates')
    .delete()
    .eq('id', importantDateId)
    .eq('account_id', accountId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as ImportantDate | null) ?? null;
}

/** Idempotência do lembrete anual (ver important_date_logs, migration 0018) — um por data por ano. */
export async function hasSentImportantDateReminderThisYear(importantDateId: string, year: number): Promise<boolean> {
  const { count, error } = await getSupabaseClient()
    .from('important_date_logs')
    .select('*', { count: 'exact', head: true })
    .eq('important_date_id', importantDateId)
    .eq('sent_year', year);

  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function logImportantDateReminder(importantDateId: string, year: number): Promise<void> {
  const { error } = await getSupabaseClient().from('important_date_logs').insert({ important_date_id: importantDateId, sent_year: year });
  if (error) throw error;
}
