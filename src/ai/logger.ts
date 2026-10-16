/**
 * CLAUDE.md: "Logar toda tool call da IA (nome + parâmetros + resultado)
 * desde o primeiro commit — é o principal insumo de debug de erros de
 * interpretação de linguagem natural."
 *
 * Por ora loga em stdout como JSON estruturado. Quando a camada de
 * persistência (Supabase) existir, troque o `console.log` por um insert
 * numa tabela `ai_tool_calls` — a assinatura desta função não precisa
 * mudar para quem a chama.
 */
export function logToolCall(record: {
  tool: string;
  input: unknown;
  result: unknown;
  isError: boolean;
  userId?: string;
}): void {
  console.log(
    JSON.stringify({
      type: "ai_tool_call",
      at: new Date().toISOString(),
      ...record,
    }),
  );
}

/**
 * Envolve o `run` de uma tool para logar automaticamente toda chamada.
 * O SDK exige que `run` devolva string (ou content blocks) — aqui o
 * handler da tool devolve um objeto estruturado, que é logado como está
 * e serializado como JSON para o modelo.
 */
export function withToolLogging<Input, Output>(
  toolName: string,
  run: (input: Input) => Promise<Output>,
): (input: Input) => Promise<string> {
  return async (input: Input) => {
    try {
      const result = await run(input);
      logToolCall({ tool: toolName, input, result, isError: false });
      return JSON.stringify(result);
    } catch (err) {
      const result = err instanceof Error ? err.message : String(err);
      logToolCall({ tool: toolName, input, result, isError: true });
      throw err;
    }
  };
}
