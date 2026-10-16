# Schema — log de tool calls

A regra transversal 4 do roteiro do Tom (`docs/conversas-tom.md`) exige logar toda tool call
(nome, parâmetros, resultado) desde o primeiro turno. Este documento fixa onde e como esse log
vive, para que seja de fato consultável como insumo de depuração de interpretação de linguagem
natural — e não apenas uma promessa no texto.

## Tabela `tool_call_logs`

| Coluna | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | `uuid` | sim | chave primária |
| `user_id` | `uuid` | sim | FK para `users` |
| `tool_name` | `text` | sim | nome da tool chamada (ex.: `createTransaction`) |
| `params` | `jsonb` | sim | parâmetros enviados à tool, como recebidos do orquestrador |
| `result` | `jsonb` | não | resultado da execução (registro criado/atualizado, ou erro) |
| `confidence` | `numeric` | não | confiança da classificação da IA, quando aplicável (categoria, transcrição) |
| `latency_ms` | `integer` | sim | tempo entre a chamada da tool e o retorno |
| `created_at` | `timestamptz` | sim | default `now()` |

## Índice

`CREATE INDEX ON tool_call_logs (user_id, created_at);`

Cobre o uso principal: puxar o histórico de tool calls de um usuário específico em um período,
para investigar um erro de interpretação relatado ou reproduzido.

## Regra de escrita

Toda tool — de leitura ou escrita — grava uma linha nessa tabela ao final da execução,
sucesso ou falha. Uma falha de persistência (caso 6.4 do roteiro do Tom) também gera log, com
`result` descrevendo o erro — é precisamente esse registro que permite diferenciar "a IA
interpretou errado" de "o banco estava fora do ar" ao investigar uma reclamação do usuário.
