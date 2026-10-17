import { getSupabaseClient } from '../client.js';

/**
 * Idempotência do resumo semanal proativo — tabela separada de
 * proactive_insight_logs (Fase 3) de propósito: resumo agendado e sinal de
 * anomalia são conceitos diferentes, sem acoplar o cap de 1/semana de um ao
 * cap de 1/dia do outro.
 */
export async function hasSentWeeklyDigestSince(accountId: string, sinceIso: string): Promise<boolean> {
  const { count, error } = await getSupabaseClient()
    .from('weekly_digest_logs')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('sent_at', sinceIso);

  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function logWeeklyDigest(accountId: string): Promise<void> {
  const { error } = await getSupabaseClient().from('weekly_digest_logs').insert({ account_id: accountId });
  if (error) throw error;
}
