import { getSupabaseClient } from '../client.js';

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
    // eslint-disable-next-line no-console
    console.error('Failed to write tool_call_log', { toolName: input.toolName, error });
  }
}
