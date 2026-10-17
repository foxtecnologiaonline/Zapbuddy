import { getSupabaseClient } from '../client.js';
import { logger } from '../logger.js';
import type { ToolCallLog } from '../types.js';

export interface LogToolCallInput {
  userId: string | null;
  toolName: string;
  parameters: Record<string, unknown>;
  result: unknown;
  success: boolean;
  error?: string;
  durationMs?: number;
}

/**
 * Every tool call the AI makes is logged here, unconditionally — this is the
 * primary debugging input for natural-language interpretation errors
 * (non-negotiable per CLAUDE.md), so this must never throw silently swallowed:
 * callers log best-effort but a failure here must not block the user response.
 */
export async function logToolCall(input: LogToolCallInput): Promise<void> {
  const { error } = await getSupabaseClient().from('tool_call_logs').insert({
    user_id: input.userId,
    tool_name: input.toolName,
    parameters: input.parameters,
    result: input.result ?? null,
    success: input.success,
    error: input.error ?? null,
    duration_ms: input.durationMs ?? null,
  });

  if (error) {
    logger.error('tool_call_log_write_failed', { toolName: input.toolName, error });
  }
}

export async function countToolCallLogsSince(sinceIso: string, success?: boolean): Promise<number> {
  let query = getSupabaseClient()
    .from('tool_call_logs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', sinceIso);
  if (success !== undefined) query = query.eq('success', success);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export const TOOL_CALL_LOGS_PAGE_SIZE = 50;

export interface ListToolCallLogsResult {
  logs: ToolCallLog[];
  total: number;
}

/** Lista paginada de "chamadas" (tool calls da IA) pro admin, com filtro opcional por sucesso. */
export async function listToolCallLogs(page: number, success?: boolean): Promise<ListToolCallLogsResult> {
  const from = page * TOOL_CALL_LOGS_PAGE_SIZE;
  const to = from + TOOL_CALL_LOGS_PAGE_SIZE - 1;

  let query = getSupabaseClient()
    .from('tool_call_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (success !== undefined) query = query.eq('success', success);

  const { data, error, count } = await query;
  if (error) throw error;
  return { logs: (data ?? []) as ToolCallLog[], total: count ?? 0 };
}

// Teto de segurança pro job interpretation-feedback (mesmo raciocínio do
// MAX_TRANSACTIONS_PER_QUERY em transactions.ts): evita que um período com
// volume muito alto vire uma consulta sem fim — as estatísticas ficariam
// parciais nesse caso, aceitável pra um relatório de apoio, não pra dado
// financeiro.
const MAX_TOOL_CALL_LOGS_PER_RANGE = 5000;

/** Todas as tool calls (sucesso e falha) num período — usado pelo job de agregação de erros de interpretação. */
export async function listToolCallLogsInRange(fromIso: string, toIso: string): Promise<ToolCallLog[]> {
  const { data, error } = await getSupabaseClient()
    .from('tool_call_logs')
    .select('*')
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(MAX_TOOL_CALL_LOGS_PER_RANGE);

  if (error) throw error;
  return (data ?? []) as ToolCallLog[];
}

/**
 * Expurgo de retenção (job semanal logs-retention, 90 dias) — tool_call_logs
 * cresce sem teto (nenhuma coluna de TTL no Postgres, diferente do Redis) e é
 * consultado no admin com índice por (user_id, created_at desc); sem isso, a
 * tabela só aumenta indefinidamente sem benefício depois da janela que
 * qualquer consumidor real usa (admin mostra hoje/7 dias;
 * interpretation-feedback agrega só os últimos 7 dias — ver PERIOD_MS).
 * 90 dias dá folga grande sobre os dois sem acumular pra sempre.
 */
export async function deleteToolCallLogsOlderThan(cutoffIso: string): Promise<number> {
  const { error, count } = await getSupabaseClient()
    .from('tool_call_logs')
    .delete({ count: 'exact' })
    .lt('created_at', cutoffIso);

  if (error) throw error;
  return count ?? 0;
}

export async function listRecentFailedToolCallLogs(limit: number): Promise<ToolCallLog[]> {
  const { data, error } = await getSupabaseClient()
    .from('tool_call_logs')
    .select('*')
    .eq('success', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ToolCallLog[];
}
