import { getSupabaseClient } from '../client.js';
import type { InstallmentPlan } from '../types.js';

export interface CreateInstallmentPlanInput {
  accountId: string;
  userId: string;
  description: string;
  installmentCents: number;
  totalInstallments: number;
  /** YYYY-MM-01 */
  firstDueMonth: string;
  dueDay: number;
}

export async function createInstallmentPlan(input: CreateInstallmentPlanInput): Promise<InstallmentPlan> {
  const { data, error } = await getSupabaseClient()
    .from('installment_plans')
    .insert({
      account_id: input.accountId,
      created_by_user_id: input.userId,
      description: input.description,
      installment_cents: input.installmentCents,
      total_installments: input.totalInstallments,
      first_due_month: input.firstDueMonth,
      due_day: input.dueDay,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as InstallmentPlan;
}

export async function listActiveInstallmentPlans(accountId: string): Promise<InstallmentPlan[]> {
  const { data, error } = await getSupabaseClient()
    .from('installment_plans')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as InstallmentPlan[];
}

export async function cancelInstallmentPlan(accountId: string, planId: string): Promise<InstallmentPlan | null> {
  const { data, error } = await getSupabaseClient()
    .from('installment_plans')
    .update({ status: 'cancelled' })
    .eq('account_id', accountId)
    .eq('id', planId)
    .eq('status', 'active')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as InstallmentPlan | null) ?? null;
}
