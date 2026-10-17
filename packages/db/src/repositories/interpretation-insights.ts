import { getSupabaseClient } from '../client.js';
import type { InterpretationInsight } from '../types.js';

export interface InsertInterpretationInsightInput {
  periodStartIso: string;
  periodEndIso: string;
  summary: string;
  stats: Record<string, unknown>;
}

/**
 * Relatório gerado pelo job semanal interpretation-feedback — nunca alterado
 * por código, só lido (admin/humano). Ver CLAUDE.md, amendamento "Pesquisa
 * autônoma e aprendizado contínuo".
 */
export async function insertInterpretationInsight(
  input: InsertInterpretationInsightInput,
): Promise<InterpretationInsight> {
  const { data, error } = await getSupabaseClient()
    .from('interpretation_insights')
    .insert({
      period_start: input.periodStartIso,
      period_end: input.periodEndIso,
      summary: input.summary,
      stats: input.stats,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as InterpretationInsight;
}

export async function listRecentInterpretationInsights(limit: number): Promise<InterpretationInsight[]> {
  const { data, error } = await getSupabaseClient()
    .from('interpretation_insights')
    .select('*')
    .order('period_start', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as InterpretationInsight[];
}
