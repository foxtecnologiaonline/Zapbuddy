import { getSupabaseClient } from '../client.js';
import type { Transaction, TransactionSource, TransactionType } from '../types.js';

export interface RecordTransactionInput {
  userId: string;
  type: TransactionType;
  amountCents: number;
  category: string;
  description?: string;
  source: TransactionSource;
  rawInput?: string;
  occurredAt?: string;
}

/**
 * The single write path for financial data. The AI must call this (via the
 * record_transaction tool) before it is allowed to confirm an expense/income
 * to the user — never confirm from the model's own text.
 */
export async function recordTransaction(input: RecordTransactionInput): Promise<Transaction> {
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .insert({
      user_id: input.userId,
      type: input.type,
      amount_cents: input.amountCents,
      category: input.category,
      description: input.description ?? null,
      source: input.source,
      raw_input: input.rawInput ?? null,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Transaction;
}

// Teto de segurança, não um limite esperado na prática (MVP é resumo
// diário/semanal/mensal) — evita que um range muito largo vire uma consulta
// sem fim. Se algum dia for atingido, soma/resumo ficam parciais e
// silenciosamente incompletos para esse range — aceitável como salvaguarda,
// não como comportamento normal.
const MAX_TRANSACTIONS_PER_QUERY = 2000;

export async function listTransactions(
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<Transaction[]> {
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('occurred_at', fromIso)
    .lte('occurred_at', toIso)
    .order('occurred_at', { ascending: false })
    .limit(MAX_TRANSACTIONS_PER_QUERY);

  if (error) throw error;
  return (data ?? []) as Transaction[];
}

export interface TransactionSummary {
  totalIncomeCents: number;
  totalExpenseCents: number;
  byCategory: Record<string, number>;
  count: number;
}

export async function summarizeTransactions(
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<TransactionSummary> {
  const rows = await listTransactions(userId, fromIso, toIso);

  const summary: TransactionSummary = {
    totalIncomeCents: 0,
    totalExpenseCents: 0,
    byCategory: {},
    count: rows.length,
  };

  for (const row of rows) {
    if (row.type === 'income') {
      summary.totalIncomeCents += row.amount_cents;
    } else {
      summary.totalExpenseCents += row.amount_cents;
      summary.byCategory[row.category] = (summary.byCategory[row.category] ?? 0) + row.amount_cents;
    }
  }

  return summary;
}
