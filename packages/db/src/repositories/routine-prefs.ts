import { getSupabaseClient } from '../client.js';
import { logger } from '../logger.js';
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

/**
 * Opt-out do insight das 19h e do resumo semanal (migration 0031). Ficam FORA de `RoutinePrefs`/`COLUMNS` de propósito: selecionar
 * colunas novas junto com as antigas faria o sweep inteiro falhar se o deploy do worker chegasse antes do SQL — e o sweep é o que
 * manda o bom dia de todo mundo.
 */
export interface ProactiveOptOutPatch {
  routine_insights?: boolean;
  routine_weekly_digest?: boolean;
}

export interface ProactiveOptOuts {
  /** Usuários que desligaram o insight diário. */
  insightsOff: Set<string>;
  /** Usuários que desligaram o resumo semanal. */
  weeklyDigestOff: Set<string>;
}

let warnedOptOutUnavailable = false;

/**
 * Quem desligou o insight ou o resumo semanal. NUNCA lança: se as colunas ainda não existem (migration 0031 por aplicar) ou a
 * leitura falha, devolve "ninguém desligou" (o comportamento de antes) e avisa uma vez por processo. Uma consulta só por passada do
 * sweep, e só traz quem desligou (a imensa maioria não aparece).
 */
export async function listProactiveOptOuts(): Promise<ProactiveOptOuts> {
  const result: ProactiveOptOuts = { insightsOff: new Set(), weeklyDigestOff: new Set() };
  try {
    const { data, error } = await getSupabaseClient()
      .from('users')
      .select('id, routine_insights, routine_weekly_digest')
      .or('routine_insights.eq.false,routine_weekly_digest.eq.false');
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id: string; routine_insights: boolean; routine_weekly_digest: boolean }>) {
      if (row.routine_insights === false) result.insightsOff.add(row.id);
      if (row.routine_weekly_digest === false) result.weeklyDigestOff.add(row.id);
    }
  } catch (error) {
    if (!warnedOptOutUnavailable) {
      warnedOptOutUnavailable = true;
      logger.warn('proactive_opt_out_unavailable', {
        hint: 'aplicar a migration 0031_proactive_opt_out.sql; até lá ninguém consegue desligar o insight diário nem o resumo semanal',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { insightsOff: new Set(), weeklyDigestOff: new Set() };
  }
  return result;
}

/** Grava o opt-out. LANÇA se a migration 0031 não foi aplicada: quem chama diz à pessoa que não conseguiu, nunca finge. */
export async function saveProactiveOptOut(userId: string, patch: ProactiveOptOutPatch): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const { error } = await getSupabaseClient().from('users').update(patch).eq('id', userId);
  if (error) throw error;
}

/** Só pra testes. */
export function resetProactiveOptOutWarning(): void {
  warnedOptOutUnavailable = false;
}
