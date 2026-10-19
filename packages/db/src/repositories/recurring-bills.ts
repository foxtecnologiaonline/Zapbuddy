import { getSupabaseClient } from '../client.js';
import type { RecurringBill } from '../types.js';

export interface CreateRecurringBillInput {
  accountId: string;
  userId: string;
  name: string;
  amountCents: number;
  dueDay: number;
}

export async function createRecurringBill(input: CreateRecurringBillInput): Promise<RecurringBill> {
  const { data, error } = await getSupabaseClient()
    .from('recurring_bills')
    .insert({
      account_id: input.accountId,
      created_by_user_id: input.userId,
      name: input.name,
      amount_cents: input.amountCents,
      due_day: input.dueDay,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as RecurringBill;
}

export async function listActiveRecurringBills(accountId: string): Promise<RecurringBill[]> {
  const { data, error } = await getSupabaseClient()
    .from('recurring_bills')
    .select('*')
    .eq('account_id', accountId)
    .eq('active', true)
    .order('due_day', { ascending: true });

  if (error) throw error;
  return (data ?? []) as RecurringBill[];
}

/** Desativa em vez de apagar: a conta recorrente pode ter sido cadastrada por engano e a pessoa só quer parar os avisos. */
export async function deactivateRecurringBill(accountId: string, billId: string): Promise<RecurringBill | null> {
  const { data, error } = await getSupabaseClient()
    .from('recurring_bills')
    .update({ active: false })
    .eq('id', billId)
    .eq('account_id', accountId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as RecurringBill | null) ?? null;
}
