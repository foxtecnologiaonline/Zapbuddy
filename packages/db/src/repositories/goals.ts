import { getSupabaseClient } from '../client.js';
import type { SavingsGoal, SavingsGoalStatus } from '../types.js';

export interface CreateGoalInput {
  accountId: string;
  userId: string;
  title: string;
  targetCents: number;
  deadline: string | null;
}

export async function createGoal(input: CreateGoalInput): Promise<SavingsGoal> {
  const { data, error } = await getSupabaseClient()
    .from('goals')
    .insert({
      account_id: input.accountId,
      created_by_user_id: input.userId,
      title: input.title,
      target_cents: input.targetCents,
      deadline: input.deadline,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as SavingsGoal;
}

export async function listGoals(accountId: string, status: SavingsGoalStatus = 'active'): Promise<SavingsGoal[]> {
  const { data, error } = await getSupabaseClient()
    .from('goals')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', status)
    .order('deadline', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as SavingsGoal[];
}

export async function findGoal(accountId: string, goalId: string): Promise<SavingsGoal | null> {
  const { data, error } = await getSupabaseClient()
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) throw error;
  return (data as SavingsGoal | null) ?? null;
}

/**
 * Soma o valor que a pessoa declarou ter guardado. Não lê de transações: a
 * meta é um compromisso declarado, não uma categoria de gasto — e o total
 * nunca é inventado pela IA, só o que a pessoa informou.
 */
export async function addGoalProgress(goal: SavingsGoal, amountCents: number): Promise<SavingsGoal> {
  const savedCents = goal.saved_cents + amountCents;
  const completed = savedCents >= goal.target_cents;

  const { data, error } = await getSupabaseClient()
    .from('goals')
    .update({
      saved_cents: savedCents,
      status: completed ? 'completed' : goal.status,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq('id', goal.id)
    .eq('account_id', goal.account_id)
    .select('*')
    .single();

  if (error) throw error;
  return data as SavingsGoal;
}

export async function cancelGoal(accountId: string, goalId: string): Promise<SavingsGoal | null> {
  const { data, error } = await getSupabaseClient()
    .from('goals')
    .update({ status: 'cancelled' })
    .eq('id', goalId)
    .eq('account_id', accountId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as SavingsGoal | null) ?? null;
}
