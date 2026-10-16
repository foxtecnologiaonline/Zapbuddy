# Contrato de validação das tools

Reforça a regra transversal 1 do roteiro do Tom ("persistir antes de confirmar") com uma
camada de validação declarada: toda tool de escrita valida seu input contra o schema abaixo
*antes* de tocar o banco. Se a validação falhar, a tool não executa, nenhum dado é persistido
e Tom nunca monta uma resposta de confirmação — ou pergunta o campo faltante (quando o motivo
da falha é ambiguidade do usuário, não erro de programação) ou reporta erro (caso 6.4).

Validação é feita com schema (ex.: Zod/JSON Schema) na borda da tool, não confiada ao
julgamento do LLM.

## `createTransaction`

| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| `user_id` | uuid | sim | existe em `users` |
| `type` | enum | sim | `"expense"` \| `"income"` |
| `amount` | numeric | sim | > 0 |
| `category` | enum | sim | pertence a `docs/categorias-financeiras.md`, compatível com `type` |
| `description` | text | não | — |
| `source` | enum | sim | `"text"` \| `"audio"` |
| `amount_approximate` | boolean | não | default `false` |

Falha de validação mais comum: `amount` ausente ou `category` fora da lista fechada — ambas já
tratadas no roteiro (casos 2.4 e 2.5) como pergunta ao usuário, nunca como erro técnico.

## `updateTransaction`

| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| `transaction_id` | uuid | sim | existe e pertence ao `user_id` da sessão |
| `amount` | numeric | não (ao menos 1 campo de atualização obrigatório) | > 0 se presente |
| `category` | enum | não | pertence à taxonomia, se presente |

Se mais de um registro candidato for encontrado por `findRecentTransaction` (caso 2.6), a tool
não executa — devolve a lista de candidatos para Tom perguntar, não escolhe sozinha.

## `createTask`

| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| `user_id` | uuid | sim | existe em `users` |
| `title` | text | sim | não vazio |
| `due_date` | date | não | — |
| `status` | enum | sim | default `"open"` |

## `updateTask`

| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| `task_id` | uuid | sim | existe e pertence ao `user_id` |
| `status` \| `due_date` | — | ao menos um presente | `status` ∈ `{"open","done"}` |

Mesma regra de ambiguidade de `updateTransaction`: mais de um candidato de `findTaskByDescription`
→ a tool devolve candidatos, não decide sozinha (caso 3.3).

## `createReminder`

| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| `user_id` | uuid | sim | existe em `users` |
| `title` | text | sim | não vazio |
| `due_at` | timestamptz | sim | no futuro |
| `status` | enum | sim | default `"scheduled"` |

## `updateReminder`

| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| `reminder_id` | uuid | sim | existe e pertence ao `user_id` |
| `status` | enum | sim | `{"fired","done","snoozed"}` |
| `snoozed_until` | timestamptz | só se `status="snoozed"` | no futuro |

## Comportamento padrão em caso de falha de validação

1. **Campo obrigatório ausente por ambiguidade do usuário** (ex.: sem `amount`, sem
   `category` clara) → não é erro técnico; Tom pergunta o campo faltante (casos 2.4, 2.5, 3.4).
2. **Valor fora do domínio** (ex.: `category` que não existe na taxonomia, `amount` negativo)
   → erro de programação/schema; a tool rejeita antes de chamar o banco, e isso é logado em
   `tool_call_logs` (`docs/schema-logs.md`) com o motivo da rejeição.
3. **Falha de escrita no banco** (conexão, timeout) → caso 6.4 do roteiro: Tom informa erro,
   nunca confirma.
