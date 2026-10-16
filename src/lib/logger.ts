import { getSupabase } from "../db/supabase";

export async function logToolCall(params: {
  userId: string | null;
  toolName: string;
  params: Record<string, unknown>;
  result: unknown;
  error: string | null;
  durationMs: number;
}): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("tool_call_logs").insert({
    user_id: params.userId,
    tool_name: params.toolName,
    params: params.params,
    result: params.result,
    error: params.error,
    duration_ms: params.durationMs,
  });

  if (error) {
    // Falha de log nunca pode quebrar o fluxo de resposta ao usuário.
    console.error("Falha ao gravar tool_call_log", error);
  }
}

// Todo tool call passa por aqui — é o ciclo de melhoria contínua: revisão semanal destes logs
// nas primeiras semanas pós-launch é o único jeito de corrigir erro de interpretação com dado real.
export async function withToolLogging<T>(
  userId: string | null,
  toolName: string,
  params: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await logToolCall({ userId, toolName, params, result, error: null, durationMs: Date.now() - start });
    return result;
  } catch (err) {
    await logToolCall({
      userId,
      toolName,
      params,
      result: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    });
    throw err;
  }
}
