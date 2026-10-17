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
