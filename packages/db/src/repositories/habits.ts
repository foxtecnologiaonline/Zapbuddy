import { getSupabaseClient } from '../client.js';
import type { Habit, HabitCheckin } from '../types.js';

const ACTIVE_HABITS_LIMIT = 30;
/** Janela de leitura de check-ins — o suficiente pra uma sequência de mais de um ano sem trazer o histórico inteiro. */
const CHECKINS_LOOKBACK_DAYS = 400;

export async function createHabit(accountId: string, userId: string, name: string): Promise<Habit> {
  const { data, error } = await getSupabaseClient()
    .from('habits')
    .insert({ account_id: accountId, created_by_user_id: userId, name })
    .select('*')
    .single();

  if (error) throw error;
  return data as Habit;
}

export async function listActiveHabits(accountId: string): Promise<Habit[]> {
  const { data, error } = await getSupabaseClient()
    .from('habits')
    .select('*')
    .eq('account_id', accountId)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(ACTIVE_HABITS_LIMIT);

  if (error) throw error;
  return (data ?? []) as Habit[];
}

export async function findActiveHabit(accountId: string, habitId: string): Promise<Habit | null> {
  const { data, error } = await getSupabaseClient()
    .from('habits')
    .select('*')
    .eq('id', habitId)
    .eq('account_id', accountId)
    .eq('active', true)
    .maybeSingle();

  if (error) throw error;
  return (data as Habit | null) ?? null;
}

/** Arquiva (não apaga): o histórico de check-ins continua no export da conta. */
export async function archiveHabit(accountId: string, habitId: string): Promise<Habit | null> {
  const { data, error } = await getSupabaseClient()
    .from('habits')
    .update({ active: false, archived_at: new Date().toISOString() })
    .eq('id', habitId)
    .eq('account_id', accountId)
    .eq('active', true)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as Habit | null) ?? null;
}

/** Remove de verdade — só pro "desfazer" de um hábito recém-criado por engano. */
export async function deleteHabit(accountId: string, habitId: string): Promise<Habit | null> {
  const { data, error } = await getSupabaseClient()
    .from('habits')
    .delete()
    .eq('id', habitId)
    .eq('account_id', accountId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as Habit | null) ?? null;
}

/**
 * Marca o dia do hábito. Idempotente pela unicidade (habit_id, checkin_date):
 * `created: false` quando o dia já estava marcado (sem erro, sem duplicar).
 */
export async function logHabitCheckin(
  accountId: string,
  userId: string,
  habitId: string,
  checkinDate: string,
): Promise<{ checkin: HabitCheckin | null; created: boolean }> {
  const { data, error } = await getSupabaseClient()
    .from('habit_checkins')
    .upsert(
      { habit_id: habitId, account_id: accountId, checkin_date: checkinDate, created_by_user_id: userId },
      { onConflict: 'habit_id,checkin_date', ignoreDuplicates: true },
    )
    .select('*')
    .maybeSingle();

  if (error) throw error;
  // ignoreDuplicates devolve linha vazia quando o dia já existia.
  return data ? { checkin: data as HabitCheckin, created: true } : { checkin: null, created: false };
}

export async function deleteHabitCheckin(accountId: string, checkinId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from('habit_checkins')
    .delete()
    .eq('id', checkinId)
    .eq('account_id', accountId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

/** Datas (YYYY-MM-DD) marcadas por hábito, dos últimos ~400 dias — base do cálculo de sequência. */
export async function listHabitCheckinDates(accountId: string, todayKey: string): Promise<Record<string, string[]>> {
  const since = new Date(`${todayKey}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - CHECKINS_LOOKBACK_DAYS);

  const { data, error } = await getSupabaseClient()
    .from('habit_checkins')
    .select('habit_id, checkin_date')
    .eq('account_id', accountId)
    .gte('checkin_date', since.toISOString().slice(0, 10))
    .order('checkin_date', { ascending: false })
    .limit(10_000);

  if (error) throw error;
  const byHabit: Record<string, string[]> = {};
  for (const row of (data ?? []) as Array<{ habit_id: string; checkin_date: string }>) {
    (byHabit[row.habit_id] ??= []).push(row.checkin_date);
  }
  return byHabit;
}

/** Contagem de check-ins (todos os hábitos) desde uma data local — usada pelo resumo semanal. */
export async function countHabitCheckinsSince(accountId: string, sinceDateKey: string): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from('habit_checkins')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('checkin_date', sinceDateKey);

  if (error) throw error;
  return count ?? 0;
}
