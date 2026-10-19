import { getSupabaseClient } from '../client.js';
import type { Transaction, TransactionSource, TransactionType } from '../types.js';

export interface RecordTransactionInput {
  accountId: string;
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
 * to the user — never confirm from the model's own text. `accountId` scopes
 * the data (shared across members in a multiuser account — ADR 0002);
 * `userId` is kept as the author for audit, not for scoping reads.
 */
export async function recordTransaction(input: RecordTransactionInput): Promise<Transaction> {
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .insert({
      account_id: input.accountId,
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

// Janela de correção: "errei, foi 54 não 45" só faz sentido como correção do
// lançamento que acabou de ser feito na mesma conversa — fora dessa janela,
// é mais seguro a IA tratar como um gasto novo (ou perguntar) do que mexer
// num registro antigo que a pessoa pode nem estar se referindo.
const CORRECTION_WINDOW_MINUTES = 30;

export interface UpdateLastTransactionInput {
  accountId: string;
  amountCents?: number;
  category?: string;
  description?: string;
}

/**
 * Corrige a transação mais recente da conta (dentro da janela acima, não
 * necessariamente lançada por quem está corrigindo — numa conta
 * compartilhada, um membro pode corrigir o que o outro acabou de lançar),
 * sem exigir um transaction_id — o modelo nunca recebe esse id de volta de
 * forma que consiga repeti-lo num turno futuro (o histórico curto prazo
 * guarda só texto da conversa, não os blocos de tool call/resultado).
 * Retorna null se não houver transação recente o bastante pra corrigir.
 */
export async function updateLastTransaction(input: UpdateLastTransactionInput): Promise<Transaction | null> {
  const cutoffIso = new Date(Date.now() - CORRECTION_WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data: candidates, error: findError } = await getSupabaseClient()
    .from('transactions')
    .select('id')
    .eq('account_id', input.accountId)
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(1);

  if (findError) throw findError;
  const last = (candidates ?? [])[0] as { id: string } | undefined;
  if (!last) return null;

  const changes: Record<string, unknown> = {};
  if (input.amountCents !== undefined) changes.amount_cents = input.amountCents;
  if (input.category !== undefined) changes.category = input.category;
  if (input.description !== undefined) changes.description = input.description;

  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .update(changes)
    .eq('id', last.id)
    .eq('account_id', input.accountId)
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
  accountId: string,
  fromIso: string,
  toIso: string,
  options: ListTransactionsOptions = {},
): Promise<Transaction[]> {
  const { limit = MAX_TRANSACTIONS_PER_QUERY, columns = '*' } = options;
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .select(columns)
    .eq('account_id', accountId)
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

export interface RecentCategorization {
  description: string;
  category: string;
  type: TransactionType;
}

const FEW_SHOT_EXAMPLES_LIMIT = 5;

/**
 * As últimas transações com descrição da conta — alimenta o system prompt
 * (buildSystemPrompt) com exemplos reais de como ESSA conta categoriza, não
 * só a lista fixa de categorias preferidas (categories.ts). Só com
 * `description` não-nulo: sem descrição não há nada pro modelo comparar
 * (ver suggestion #8 da revisão: few-shot de categorização por histórico).
 */
export async function listRecentCategorizedTransactions(accountId: string): Promise<RecentCategorization[]> {
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .select('description, category, type')
    .eq('account_id', accountId)
    .not('description', 'is', null)
    .order('created_at', { ascending: false })
    .limit(FEW_SHOT_EXAMPLES_LIMIT);

  if (error) throw error;
  return (data ?? []) as RecentCategorization[];
}

export interface TransactionSummary {
  totalIncomeCents: number;
  totalExpenseCents: number;
  byCategory: Record<string, number>;
  count: number;
}

export async function summarizeTransactions(
  accountId: string,
  fromIso: string,
  toIso: string,
): Promise<TransactionSummary> {
  // Só soma/agrupa — não precisa de description/raw_input/source, então pede
  // só as colunas usadas abaixo em vez do '*' default.
  const rows = await listTransactions(accountId, fromIso, toIso, { columns: 'type, amount_cents, category' });

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

/** Remove uma transação recém-registrada (usado só pelo "desfazer"). Escopado por conta. */
export async function deleteTransaction(accountId: string, transactionId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('account_id', accountId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}
