# Schema — log de tool calls

> **Reconciliado com o código real em 2026-10-17.** Esta versão substitui a anterior, que
> inventou colunas (`confidence`, `latency_ms`) inexistentes na implementação. Fonte de
> verdade: `packages/db/src/repositories/tool-call-logs.ts` e `packages/db/src/types.ts`.

## Tabela `tool_call_logs` (real)

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` | chave primária |
| `user_id` | `uuid \| null` | FK para `users`; nulo quando a chamada não está associada a um usuário resolvido |
| `tool_name` | `text` | nome da tool chamada (ex.: `record_transaction`) |
| `parameters` | `jsonb` | parâmetros recebidos pela tool |
| `result` | `jsonb \| null` | resultado da execução (nulo em caso de falha) |
| `success` | `boolean` | se a execução terminou sem erro |
| `error` | `text \| null` | mensagem de erro, quando `success = false` |
| `created_at` | `timestamptz` | default `now()` |

Não existe coluna de confiança de classificação nem de latência — uma versão anterior deste
documento as propunha, mas elas nunca foram implementadas. A auditoria de precisão de
categorização usa o campo `category_fallback` que `record_transaction` já devolve dentro de
`result` (ver `docs/tools-contrato.md`), não uma coluna de confiança separada.

## Regra de escrita

`logToolCall()` é chamado pelo `tool-runner.ts` para toda tool, sucesso ou falha,
incondicionalmente — essa gravação é "o principal insumo de debug de erros de interpretação de
linguagem natural" por exigência do `CLAUDE.md`, então uma falha ao gravar o log é registrada
via `logger.error` mas nunca bloqueia a resposta ao usuário (best-effort, não é transacional
com a ação principal da tool).
