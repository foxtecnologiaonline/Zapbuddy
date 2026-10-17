# Contrato das tools do orquestrador LLM

> **Reconciliado com o código real em 2026-10-17.** Esta versão substitui a anterior — escrita
> antes de eu ter visibilidade de `packages/core/src/llm/tools/*` — que inventou nomes de tool,
> schemas e um comportamento de validação (rejeitar categoria desconhecida) que não existem na
> implementação. Fonte de verdade: `packages/core/src/llm/tool-types.ts` e
> `packages/core/src/llm/tools/*.ts`.

Toda tool é definida via `defineTool()` (`tool-types.ts`), que fixa `name`, `description`,
`schema` (Zod) e `execute(params, ctx)`. `ctx: ToolContext` traz `userId`, `whatsappNumber`,
`messageSource` ('text'|'audio') e `timezone`. Toda chamada é logada em `tool_call_logs`
(ver `docs/schema-logs.md`), sucesso ou falha, pelo `tool-runner.ts` — não é responsabilidade de
cada tool individual logar.

## `complete_onboarding` (`tools/onboarding.ts`)

- **Schema:** `{ name: string (min 1) }`
- **Execução:** grava o nome e marca `onboarding_completed_at`.
- **Retorno:** `{ user_id, onboarding_completed: true }`
- Único passo do onboarding real — não existe campo de "segmento" (autônomo/PJ) nem preferência
  de resumo diário no modelo de `User` (`id, whatsapp_number, name, timezone,
  onboarding_completed_at, created_at`). Uma versão anterior deste roteiro descrevia esses dois
  passos — **não têm tool nem coluna correspondente hoje**.

## `record_transaction` (`tools/finance.ts`)

- **Schema:** `{ type: 'expense'|'income', amount_cents: int > 0, category: string (livre, min 1), description?: string, occurred_at?: string (datetime) }`
- **Execução:** `normalizeCategory()` resolve a categoria (ver `docs/categorias-financeiras.md`)
  e persiste via `recordTransaction()`.
- **Retorno:** `{ transaction_id, recorded: true, category (normalizada), category_fallback: boolean }`
- **Nunca rejeita por categoria inválida** — cai em `outros` e sinaliza via `category_fallback`.
  Isso corrige uma versão anterior deste documento, que descrevia validação estrita.
## `correct_last_transaction` (`tools/finance.ts`)

- **Schema:** `{ amount_cents?: int > 0, category?: string, description?: string }` — ao menos um
  campo obrigatório (refine do Zod).
- **Execução:** `updateLastTransaction()` busca a transação mais recente do usuário com
  `created_at` dentro dos últimos 30 minutos e aplica só os campos informados. Não recebe
  `transaction_id` — o modelo nunca teria como repetir esse id num turno futuro (o histórico
  curto prazo em Redis guarda só texto de conversa, não os blocos de tool call/resultado do
  turno anterior), então a resolução é sempre "a última transação do usuário", não uma busca por
  id.
- **Retorno:** `{ corrected: true, transaction_id, amount_cents, category }` ou
  `{ corrected: false, reason: 'no_recent_transaction' }` se não houver transação dentro da
  janela de 30 min.
- Cobre o cenário "errei, foi 54 não 45" do roteiro de conversa (`docs/conversas-tom.md`, 2.6).
  Não cobre correção de uma transação antiga ou busca por descrição/valor — só a mais recente.

## `get_financial_summary` (`tools/finance.ts`)

- **Schema:** `{ period: 'today' | 'last_7_days' }`
- **Execução:** calcula o intervalo no fuso do usuário (`zoned-ranges.ts`) e chama
  `summarizeTransactions()`.
- **Retorno:** `{ totalIncomeCents, totalExpenseCents, byCategory, count }`
- Reativo apenas — acionado quando o usuário pergunta. **Não existe job/fila que dispare um
  resumo diário ou semanal proativamente** (confirmado em `packages/core/src/queues/definitions.ts`:
  só há filas de transcrição de áudio, mensagem entrante e disparo de lembrete). O cenário "resumo
  diário proativo" do roteiro de conversa é proposta de produto, não comportamento atual.

## `create_task` / `list_tasks` / `complete_task` (`tools/tasks.ts`)

- `create_task`: `{ title: string (min 1), due_at?: datetime }` → `{ task_id, created: true }`
- `list_tasks`: `{ status?: 'pending'|'completed' }` → `{ tasks }`
- `complete_task`: `{ task_id: uuid }` → `{ task_id, completed: true }`
- **`complete_task` exige o `task_id`, não uma descrição em texto livre.** Não existe uma tool
  de "achar tarefa pela descrição" (`findTaskByDescription`, como uma versão anterior deste
  documento descrevia) — a resolução de qual tarefa o usuário quer concluir é responsabilidade
  do modelo dentro da conversa (ex.: ele já listou as tarefas e sabe o id pelo contexto
  recente), não de uma tool dedicada.

## `create_reminder` (`tools/reminders.ts`)

- **Schema:** `{ message: string (min 1), remind_at: datetime, task_id?: uuid }`
- **Execução:** persiste o lembrete e enfileira o disparo (`reminder-dispatch`, BullMQ) com o
  delay calculado até `remind_at`.
- **Retorno:** `{ reminder_id, scheduled: true }`
- **Status possíveis do lembrete:** `pending`, `sent`, `cancelled`, `failed` — **não existe
  `snoozed`.** O cenário "ainda não, me lembra depois" do roteiro de conversa não tem tool nem
  status que o suporte hoje.
- **Quando dispara, o worker manda só a mensagem** (`⏰ Lembrete: {message}`) — uma afirmação,
  não uma pergunta tipo "já pagou?". Se o usuário responder confirmando um pagamento depois
  disso, isso é processado como uma mensagem comum (o modelo pode chamar `record_transaction`
  usando o contexto da conversa recente), não um fluxo dedicado de "lembrete → confirmação →
  transação" com os dois registros amarrados.

## `send_dashboard_login_link` (`tools/dashboard-access.ts`)

- **Schema:** `{}` (sem parâmetros)
- **Execução:** gera magic link (`createMagicLink`), monta a URL a partir de `WEB_APP_URL`.
- **Retorno:** `{ login_url, expires_in_minutes: 15 }`

---

# Fase 2 (docs/adr/0002) — multiusuário, documentos, Google Agenda

Toda tool acima passou a escopar leitura/escrita por `ctx.accountId` (conta — pode ser
compartilhada), não mais `ctx.userId` (continua existindo em `ToolContext`, usado só como autor
em `record_transaction`/`create_task`/`create_reminder`, nunca mais pra filtrar).

## `invite_member` (`tools/account.ts`)

- **Schema:** `{}` (sem parâmetros)
- **Execução:** só `ctx.role === 'owner'` gera convite de verdade — checado em código, nunca
  decidido pelo modelo. `createAccountInvite()` gera código numérico de 6 dígitos, válido 15 min.
- **Retorno:** `{ invited: true, code, expires_in_minutes: 15 }` ou `{ invited: false, reason:
  'not_owner' }`.
- **Entrada na conta não é uma tool** — é interceptada em `orchestrator.ts` (regex
  `entrar <código>`) antes de qualquer chamada ao LLM. Ver decisão 1 do ADR 0002.

## `list_members` (`tools/account.ts`)

- **Schema:** `{}` (sem parâmetros)
- **Retorno:** `{ members: [{ name, role }] }`

## `find_document` (`tools/documents.ts`)

- **Schema:** `{ query?: string }`
- **Execução:** sem `query`, lista os mais recentes (`listRecentDocuments`); com `query`, busca
  por `tsvector` (nome do arquivo + legenda — **não** o conteúdo do arquivo, ver decisão 2 do
  ADR 0002) via `searchDocuments`.
- **Retorno:** `{ documents: [{ file_name, caption, created_at, download_url }] }` —
  `download_url` é um signed URL do Supabase Storage, válido 15 min.
- **Upload não é uma tool** — mensagens de documento/imagem do WhatsApp são processadas pelo
  handler `document-upload` (fila BullMQ dedicada), fora do loop do LLM.

## `create_calendar_event` (`tools/calendar.ts`)

- **Schema:** `{ summary: string, start_at: datetime, end_at: datetime, description?: string }`
- **Execução:** exige `calendar_connections` existente pra `ctx.accountId` (conectado via
  dashboard, `/api/calendar/connect`) — sem isso, retorna `{ connected: false }` e não tenta
  criar nada. Access token é sempre renovado via refresh token antes da chamada (sem cache, ver
  decisão 3 do ADR 0002).
- **Retorno:** `{ connected: true, created: true, event_id, html_link }` ou `{ connected: false }`.

## `list_calendar_events` (`tools/calendar.ts`)

- **Schema:** `{ period: 'today' | 'last_7_days' }`
- **Retorno:** `{ connected: true, events: [{ id, summary, startIso }] }` ou `{ connected: false }`.

## Comportamento padrão em falha

- **Campo obrigatório ausente por ambiguidade do usuário** (valor, categoria ou data incertos):
  não é uma validação de schema — é uma decisão do system prompt de perguntar antes de chamar a
  tool (ver regra em `system-prompt.ts`: "valor ausente ou claramente ambíguo, pergunte").
- **Falha de escrita no banco:** `logToolCall` registra `success: false` e `error`; a resposta
  ao usuário não deve confirmar a ação (mesma regra não-negociável do `CLAUDE.md`).
