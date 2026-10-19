import { getSupabaseClient } from '../client.js';
import type { PersonalGoal, GoalStatus } from '../types.js';

export async function createPersonalGoal(accountId: string, userId: string, description: string): Promise<PersonalGoal> {
  const { data, error } = await getSupabaseClient()
    .from('personal_goals')
    .insert({ account_id: accountId, created_by_user_id: userId, description })
    .select('*')
    .single();

  if (error) throw error;
  return data as PersonalGoal;
}

const DEFAULT_PERSONAL_GOALS_LIMIT = 50;

export async function listPersonalGoals(
  accountId: string,
  status?: GoalStatus,
  limit: number = DEFAULT_PERSONAL_GOALS_LIMIT,
): Promise<PersonalGoal[]> {
  let query = getSupabaseClient().from('personal_goals').select('*').eq('account_id', accountId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as PersonalGoal[];
}

export async function completePersonalGoal(accountId: string, goalId: string): Promise<PersonalGoal> {
  const { data, error } = await getSupabaseClient()
    .from('personal_goals')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', goalId)
    .eq('account_id', accountId)
    .select('*')
    .single();

  if (error) throw error;
  return data as PersonalGoal;
}

/** Remove de verdade — mesmo raciocínio de deleteTask: meta criada por engano/desistida não tem valor histórico pra manter. */
export async function deletePersonalGoal(accountId: string, goalId: string): Promise<PersonalGoal | null> {
  const { data, error } = await getSupabaseClient()
    .from('personal_goals')
    .delete()
    .eq('id', goalId)
    .eq('account_id', accountId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as PersonalGoal | null) ?? null;
}
