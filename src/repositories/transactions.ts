import { supabase } from '../lib/supabase';

export type TransactionType = 'expense' | 'income';

export interface Transaction {
  id: string;
  clientId: string;
  type: TransactionType;
  amountCents: number;
  category: string;
  description: string | null;
  occurredAt: string;
  createdAt: string;
}

interface TransactionRow {
  id: string;
  client_id: string;
  type: TransactionType;
  amount_cents: number;
  category: string;
  description: string | null;
  occurred_at: string;
  created_at: string;
}

function mapRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    clientId: row.client_id,
    type: row.type,
    amountCents: row.amount_cents,
    category: row.category,
    description: row.description,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

export interface CreateTransactionInput {
  clientId: string;
  type: TransactionType;
  amountCents: number;
  category: string;
  description?: string | null;
}

export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      client_id: input.clientId,
      type: input.type,
      amount_cents: input.amountCents,
      category: input.category,
      description: input.description ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapRow(data as TransactionRow);
}

export interface TransactionSummary {
  totalIncomeCents: number;
  totalExpenseCents: number;
  count: number;
}

export async function summarizeTransactions(clientId: string, sinceISO: string): Promise<TransactionSummary> {
  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount_cents')
    .eq('client_id', clientId)
    .gte('occurred_at', sinceISO);

  if (error) throw error;

  const rows = (data ?? []) as Pick<TransactionRow, 'type' | 'amount_cents'>[];
  let totalIncomeCents = 0;
  let totalExpenseCents = 0;

  for (const row of rows) {
    if (row.type === 'income') totalIncomeCents += row.amount_cents;
    else totalExpenseCents += row.amount_cents;
  }

  return { totalIncomeCents, totalExpenseCents, count: rows.length };
}
