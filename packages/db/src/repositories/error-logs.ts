import { getSupabaseClient } from '../client.js';
import type { ErrorLog, ErrorLogSource } from '../types.js';

export interface LogErrorInput {
  source: ErrorLogSource;
  message: string;
  detail?: unknown;
  userId?: string | null;
}

/**
 * Generic application error log — covers webhook/worker failures that fall
 * outside tool_call_logs (which only covers a tool call itself failing).
 * Best-effort: never let a logging failure mask the original error.
 */
export async function logError(input: LogErrorInput): Promise<void> {
  const { error } = await getSupabaseClient().from('error_logs').insert({
    source: input.source,
    message: input.message.slice(0, 2000),
    detail: input.detail ?? null,
    user_id: input.userId ?? null,
  });

  if (error) {
    console.error('Failed to write error_log', { source: input.source, error });
  }
}

export async function countErrorsSince(sinceIso: string): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from('error_logs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', sinceIso);

  if (error) throw error;
  return count ?? 0;
}

export async function listRecentErrors(limit: number): Promise<ErrorLog[]> {
  const { data, error } = await getSupabaseClient()
    .from('error_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ErrorLog[];
}
