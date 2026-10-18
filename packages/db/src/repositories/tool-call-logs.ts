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

/** Só created_at+success (sem params/result, que podem ser grandes) — uso: balde diário do sparkline "chamadas" no admin. */
export async function listToolCallCreatedAtSince(sinceIso: string): Promise<{ created_at: string; success: boolean }[]> {
  const { data, error } = await getSupabaseClient().from('tool_call_logs').select('created_at, success').gte('created_at', sinceIso);
  if (error) throw error;
  return (data ?? []) as { created_at: string; success: boolean }[];
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

export interface ListToolCallLogsFilters {
  success?: boolean;
  toolName?: string;
  userId?: string;
}

function applyToolCallLogFilters<T extends { eq(column: string, value: unknown): T }>(query: T, filters: ListToolCallLogsFilters): T {
  const { success, toolName, userId } = filters;
  let q = query;
  if (success !== undefined) q = q.eq('success', success);
  if (toolName) q = q.eq('tool_name', toolName);
  if (userId) q = q.eq('user_id', userId);
  return q;
}

export interface ToolCallLogsCursorPage {
  logs: ToolCallLog[];
  /** ISO de created_at do último log da página — null quando não há próxima página. Opaco: só repassar de volta, nunca interpretar. */
  nextCursor: string | null;
}

/**
 * Paginação por cursor (keyset), não por OFFSET — `tool_call_logs` é a
 * tabela que mais cresce no sistema (uma linha por tool call da IA, nunca
 * por usuário/entidade), então é a única lista do admin onde OFFSET
 * (`.range()`) ficaria lenta no volume alto: o Postgres ainda percorre e
 * descarta todas as linhas puladas antes da página pedida. Com cursor, cada
 * página custa o mesmo independente de quão profunda ela é.
 *
 * Troca aceita: sem "ir direto pra página 8", só Próxima/Anterior — natural
 * pra esse caso de uso (ninguém pula pro meio do log de debug, segue a
 * sequência). `created_at` sozinho como chave (sem desempate por id) aceita
 * um risco teórico mínimo de duas linhas com timestamp idêntico ao
 * microssegundo — inofensivo numa tela de debug interno, não um livro-caixa.
 */
export async function listToolCallLogsCursorPage(
  filters: ListToolCallLogsFilters = {},
  cursor?: string,
  limit: number = TOOL_CALL_LOGS_PAGE_SIZE,
): Promise<ToolCallLogsCursorPage> {
  let query = getSupabaseClient().from('tool_call_logs').select('*').order('created_at', { ascending: false }).limit(limit + 1);
  query = applyToolCallLogFilters(query, filters);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ToolCallLog[];
  const hasMore = rows.length > limit;
  const logs = hasMore ? rows.slice(0, limit) : rows;
  const last = logs[logs.length - 1];
  return { logs, nextCursor: hasMore && last ? last.created_at : null };
}

/** Contagem total pro título da página — separada da busca das linhas: count-only não paga o custo de OFFSET, só de índice. */
export async function countToolCallLogsForFilters(filters: ListToolCallLogsFilters = {}): Promise<number> {
  let query = getSupabaseClient().from('tool_call_logs').select('*', { count: 'exact', head: true });
  query = applyToolCallLogFilters(query, filters);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

const EXPORT_LOGS_LIMIT = 5000;

/** Export CSV cap em 5000 — "todas as chamadas" sem filtro de data não existe pra essa tabela (cresce rápido demais pra um export completo fazer sentido). */
export async function listRecentToolCallLogsForExport(filters: ListToolCallLogsFilters = {}): Promise<ToolCallLog[]> {
  let query = getSupabaseClient().from('tool_call_logs').select('*').order('created_at', { ascending: false }).limit(EXPORT_LOGS_LIMIT);
  query = applyToolCallLogFilters(query, filters);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ToolCallLog[];
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

const DEFAULT_TOOL_CALL_LOGS_BY_USER_LIMIT = 20;

/** Chamadas de tool de um contato específico, mais recentes primeiro — uso: detalhe do contato no admin. */
export async function listToolCallLogsByUser(
  userId: string,
  limit: number = DEFAULT_TOOL_CALL_LOGS_BY_USER_LIMIT,
): Promise<ToolCallLog[]> {
  const { data, error } = await getSupabaseClient()
    .from('tool_call_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ToolCallLog[];
}
