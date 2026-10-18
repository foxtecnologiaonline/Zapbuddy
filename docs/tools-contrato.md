# Contrato das tools do orquestrador LLM

> **Reconciliado com o código real em 2026-10-17.** Esta versão substitui a anterior — escrita
> antes de eu ter visibilidade de `packages/core/src/llm/tools/*` — que inventou nomes de tool,
> schemas e um comportamento de validação (rejeitar categoria desconhecida) que não existem na
> implementação. Fonte de verdade: `packages/core/src/llm/tool-types.ts` e
> `packages/core/src/llm/tools/*.ts`.

Toda tool é definida via `defineTool()` (`tool-types.ts`), que fixa `name`, `description`,
`schema` (Zod) e `execute(params, ctx)`. `ctx: ToolContext` traz `userId`, `whatsappNumber`,
`messageSource` ('text'|'audio'), `timezone`, e desde a Fase 2 (`docs/adr/0002-*.md`) também
`accountId` (escopo de dado — pode ser compartilhado entre mais de um usuário) e `role`
('owner'|'member', usado só por `invite_member` pra checar permissão). Toda chamada é logada em
`tool_call_logs` (ver `docs/schema-logs.md`), sucesso ou falha, pelo `tool-runner.ts` — não é
responsabilidade de cada tool individual logar.

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

## `create_task` / `list_tasks` / `complete_task` / `delete_task` (`tools/tasks.ts`)

- `create_task`: `{ title: string (min 1), due_at?: datetime }` → `{ task_id, created: true }`.
  `due_at`, se vier, passa por `assertPlausibleTimestamp` (`date-sanity.ts`) — só rejeita erro
  grosseiro de interpretação (ano trocado etc.), não "a data já passou" (prazo vencido é cenário
  legítimo).
- `list_tasks`: `{ status?: 'pending'|'completed' }` → `{ tasks }`
- `complete_task`: `{ task_id: uuid }` → `{ task_id, completed: true }`
- `delete_task`: `{ task_id: uuid }` → `{ deleted: true, task_id }` ou `{ deleted: false }` (id
  não existe mais nessa conta). Exclusão real (não soft-delete) — pra tarefa criada por engano,
  diferente de `complete_task`.
- **`complete_task`/`delete_task` exigem o `task_id`, não uma descrição em texto livre.** Não
  existe uma tool de "achar tarefa pela descrição" — a resolução de qual tarefa é responsabilidade
  do modelo dentro da conversa, não de uma tool dedicada.

## `create_reminder` / `cancel_reminder` (`tools/reminders.ts`)

- **Schema de `create_reminder`:** `{ message: string (min 1), remind_at: datetime, task_id?: uuid, recurrence?: 'daily'|'weekly'|'monthly' }`
- **Execução:** `remind_at` passa por `assertFutureDate` (`date-sanity.ts` — tolera 2min no
  passado por clock skew, rejeita >2 anos no futuro). Persiste o lembrete e enfileira o disparo
  (`reminder-dispatch`, BullMQ) com o delay calculado até `remind_at`.
- **Retorno:** `{ reminder_id, scheduled: true, recurrence: string | null }`
- **Status possíveis do lembrete:** `pending`, `sent`, `cancelled`, `failed` — **não existe
  `snoozed`.** O cenário "ainda não, me lembra depois" do roteiro de conversa não tem tool nem
  status que o suporte hoje.
- **Recorrência (migration 0013):** quando `recurrence` é informado, `reminder-dispatch.ts`, ao
  disparar a ocorrência atual, cria automaticamente a PRÓXIMA como uma linha/job novos (via
  `computeNextOccurrence`, `packages/core/src/time/recurrence.ts`) — não é um `repeat` nativo do
  BullMQ, de propósito: cada ocorrência fica individualmente cancelável/consultável, igual um
  lembrete comum.
- `cancel_reminder`: `{ reminder_id: uuid }` → `{ cancelled: true, reminder_id }` ou
  `{ cancelled: false }` (já disparado, já cancelado, ou de outra conta). Remove o job atrasado
  do BullMQ best-effort; mesmo se isso falhar, `reminder-dispatch.ts` já não envia nada porque o
  status deixou de ser `pending`.
- **Quando dispara, o worker manda só a mensagem** (`⏰ Lembrete: {message}`) — uma afirmação,
  não uma pergunta tipo "já pagou?". Se o usuário responder confirmando um pagamento depois
  disso, isso é processado como uma mensagem comum (o modelo pode chamar `record_transaction`
  usando o contexto da conversa recente), não um fluxo dedicado de "lembrete → confirmação →
  transação" com os dois registros amarrados.

## `set_budget_alert` (`tools/finance.ts`)

- **Schema:** `{ category: string (min 1), limit_cents: int > 0 }` — upsert por `(account_id,
  category)` (migration 0013); pedir de novo pra mesma categoria substitui o limite anterior.
- **Retorno:** `{ set: true, category, limit_cents }`
- **Efeito:** a partir daí, toda chamada de `record_transaction` com `type: 'expense'` nessa
  categoria recalcula o total do mês corrente (mesma agregação de `get_financial_summary`) e, se
  atingir o limite, inclui `budget_alert: { category, spent_cents, limit_cents }` no retorno —
  nunca uma mensagem separada, o modelo é quem decide como comunicar na mesma resposta.

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

---

# Fase 3 (docs/adr/0003) — insights proativos, indicação, API/webhooks públicos

## `get_referral_info` (`tools/account.ts`)

- **Schema:** `{}` (sem parâmetros)
- **Retorno:** `{ referral_code, total_referred }`
- **Atribuir uma indicação não é uma tool** — igual ao convite de membro, é interceptado
  deterministicamente em `orchestrator.ts` (regex `indicad[oa] <código>`), mas **não bloqueante**:
  código inválido/não reconhecido só não gera o registro em `referrals`, não impede nem atrasa o
  cadastro normal (diferente do convite — ver decisão 3 do ADR 0003).

## Insights proativos — não são tools

`detectProactiveSignal()` (`packages/core/src/insights/signals.ts`) e
`formatProactiveInsightMessage()` (`insights/message.ts`) rodam fora do loop do LLM, disparados
pelo sweep horário (fila `insights-sweep` → `insights-generate`, ver `apps/worker/src/handlers/`).
Números vêm de agregação SQL determinística (`summarizeTransactions`), mensagem vem de template
fixo (não uma chamada nova ao LLM) — ver decisão 1 do ADR 0003 pro motivo. No máximo 1 mensagem
por conta por dia, só pro dono (`proactive_insight_logs` registra o envio pra idempotência).

## API pública e webhooks — não são tools

`GET /api/v1/transactions` e `GET /api/v1/tasks` (`apps/web/app/api/v1/`), autenticados por
`Authorization: Bearer <chave>` — chave criada pelo dashboard (`/api/dashboard/api-keys`), nunca
por uma tool do WhatsApp (configuração técnica não faz sentido numa conversa). Só leitura, de
propósito — ver decisão 5 do ADR 0003 pro motivo de não existir escrita pública.

Webhooks (`transaction.created`, `task.completed`) são enfileirados por `record_transaction` e
`complete_task` via `enqueueWebhookEvent()` (`packages/core/src/webhooks/dispatch.ts`) — best
effort, nunca bloqueia a tool nem a resposta ao usuário. Entrega real acontece na fila
`webhook-dispatch` (handler em `apps/worker/src/handlers/webhook-dispatch.ts`), assinada por
HMAC-SHA256 (`X-ZapBuddy-Signature`).

---

# Melhorias de revisão (2026-10-17) — não são tools

## Resumo financeiro semanal proativo

Sexta 18h local, 1x/semana por conta (`weekly_digest_logs` pra idempotência) — reusa a mesma
varredura horária do `insights-sweep.ts` (Fase 3), só com um segundo gatilho de dia/hora
(`getLocalWeekday`, `zoned-ranges.ts`). Sempre manda (diferente do insight de anomalia, que só
dispara com sinal) — mensagem de template fixo (`digest/message.ts`), nunca uma chamada nova ao
LLM. Fila `weekly-digest-generate`.

## Few-shot de categorização por histórico

`listRecentCategorizedTransactions` (`transactions.ts`) busca as 5 últimas transações com
descrição da conta e `buildSystemPrompt` injeta um bloco "Como essa conta categoriza" no system
prompt — complementa a lista fixa de categorias preferidas com o padrão real de uso daquela
conta, sem chamada extra ao LLM. Vazio (sem bloco) pra conta sem histórico ainda.

## Validação de sanidade de data (`date-sanity.ts`)

Guard determinístico, não um parser — rejeita data implausível (remind_at no passado/muito no
futuro, occurred_at longe do presente) antes de persistir, como última rede de segurança contra
erro de interpretação de data pelo modelo. Erro vira `tool_result` com `is_error: true`; o modelo
pergunta a data certa (nunca insiste) por regra do system prompt.

## Observabilidade: duração + retenção

`tool_call_logs.duration_ms` (migration 0013) registra quanto cada tool call levou —
`tool-runner.ts` mede com `Date.now()`. `orchestration.ts` loga `latencyMs` de toda chamada LLM,
não só quando usa o fallback. Fila semanal `logs-retention` expurga `tool_call_logs` com mais de
90 dias (bem acima da janela de 7 dias que `interpretation-feedback` e o admin usam).

## Cache de prompt (Anthropic)

`anthropic-provider.ts` marca `cache_control: ephemeral` no system prompt e no último tool spec
— cacheia as ~16 definições de tool (idênticas em toda chamada) e o system prompt dentro do
mesmo turno (reenviado idêntico nas até 6 iterações do loop + wrap-up). Reduz latência/custo sem
mudar comportamento.

## Comportamento padrão em falha

- **Campo obrigatório ausente por ambiguidade do usuário** (valor, categoria ou data incertos):
  não é uma validação de schema — é uma decisão do system prompt de perguntar antes de chamar a
  tool (ver regra em `system-prompt.ts`: "valor ausente ou claramente ambíguo, pergunte").
- **Falha de escrita no banco:** `logToolCall` registra `success: false` e `error`; a resposta
  ao usuário não deve confirmar a ação (mesma regra não-negociável do `CLAUDE.md`).
