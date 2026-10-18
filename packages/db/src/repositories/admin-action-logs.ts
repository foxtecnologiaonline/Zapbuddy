import { getSupabaseClient } from '../client.js';
import { logger } from '../logger.js';
import type { AdminActionLog } from '../types.js';

export interface LogAdminActionInput {
  action: string;
  targetType: string;
  targetId?: string | null;
  detail?: unknown;
}

/**
 * Toda escrita feita a partir do painel admin passa por aqui — plan_status,
 * cancelar lembrete, criar/excluir instância Evolution. Best-effort, igual
 * logToolCall/logError: uma falha ao gravar o log de auditoria nunca pode
 * impedir a ação em si de completar (a ação já aconteceu quando isto é
 * chamado — ver ordem nas rotas que chamam esta função).
 */
export async function logAdminAction(input: LogAdminActionInput): Promise<void> {
  const { error } = await getSupabaseClient().from('admin_action_logs').insert({
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    detail: input.detail ?? null,
  });

  if (error) {
    logger.error('admin_action_log_write_failed', { action: input.action, error });
  }
}

export const ADMIN_ACTION_LOGS_PAGE_SIZE = 50;

export interface ListAdminActionLogsResult {
  logs: AdminActionLog[];
  total: number;
}

export async function listAdminActionLogs(page: number): Promise<ListAdminActionLogsResult> {
  const from = page * ADMIN_ACTION_LOGS_PAGE_SIZE;
  const to = from + ADMIN_ACTION_LOGS_PAGE_SIZE - 1;

  const { data, error, count } = await getSupabaseClient()
    .from('admin_action_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { logs: (data ?? []) as AdminActionLog[], total: count ?? 0 };
}
