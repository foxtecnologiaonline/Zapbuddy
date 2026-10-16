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

export interface ListTransactionsOptions {
  /** Cap de linhas; default é o teto de segurança (uso: resumo/agregação). */
  limit?: number;
  /** Colunas a selecionar; default '*' (uso: resumo não precisa de description/raw_input). */
  columns?: string;
}

export async function listTransactions(
  userId: string,
  fromIso: string,
  toIso: string,
  options: ListTransactionsOptions = {},
): Promise<Transaction[]> {
  const { limit = MAX_TRANSACTIONS_PER_QUERY, columns = '*' } = options;
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .select(columns)
    .eq('user_id', userId)
    .gte('occurred_at', fromIso)
    .lte('occurred_at', toIso)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  // `columns` dinâmico (não um literal) faz o client perder o tipo exato da
  // linha retornada — cast explícito via `unknown`, igual já se faz em
  // recordTransaction acima pro mesmo client.
  return (data ?? []) as unknown as Transaction[];
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
  // Só soma/agrupa — não precisa de description/raw_input/source, então pede
  // só as colunas usadas abaixo em vez do '*' default.
  const rows = await listTransactions(userId, fromIso, toIso, { columns: 'type, amount_cents, category' });

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
