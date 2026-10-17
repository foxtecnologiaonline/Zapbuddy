import { getSupabaseClient } from '../client.js';
import type { ProactiveInsightSignalType } from '../types.js';

/** `todayStartIso`/`todayEndIso` já calculados no fuso do dono da conta (ver zoned-ranges.ts) — nunca calculado aqui. */
export async function hasSentProactiveInsightToday(accountId: string, todayStartIso: string, todayEndIso: string): Promise<boolean> {
  const { count, error } = await getSupabaseClient()
    .from('proactive_insight_logs')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('sent_at', todayStartIso)
    .lte('sent_at', todayEndIso);

  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function logProactiveInsight(accountId: string, signalType: ProactiveInsightSignalType, summary: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('proactive_insight_logs')
    .insert({ account_id: accountId, signal_type: signalType, summary });
  if (error) throw error;
}
