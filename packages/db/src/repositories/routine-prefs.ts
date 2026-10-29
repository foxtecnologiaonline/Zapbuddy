import { getSupabaseClient } from '../client.js';
import type { RoutinePrefs } from '../types.js';

const COLUMNS = 'routine_checkins, routine_weekly_tip, routine_day_close, routine_week_review';

export async function getRoutinePrefs(userId: string): Promise<RoutinePrefs> {
  const { data, error } = await getSupabaseClient().from('users').select(COLUMNS).eq('id', userId).single();
  if (error) throw error;
  return data as RoutinePrefs;
}

export async function saveRoutinePrefs(userId: string, patch: Partial<RoutinePrefs>): Promise<RoutinePrefs> {
  const { data, error } = await getSupabaseClient().from('users').update(patch).eq('id', userId).select(COLUMNS).single();
  if (error) throw error;
  return data as RoutinePrefs;
}
