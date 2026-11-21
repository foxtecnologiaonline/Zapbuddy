# ZapBuddy

Parceiro pessoal 24 horas via WhatsApp (B2C, pessoa física) para gestão do
tempo (agenda e compromissos), tarefas e notas pessoais e gestão
financeira pessoal. Não é produto de gestão empresarial (MEI/PJ, DAS e
nota fiscal ficaram de fora de propósito — ver `CLAUDE.md`). O nome do assistente que o usuário vê é
**Tom** — "ZapBuddy" é o produto/plataforma, "Tom" é a persona de IA
dentro dele.

O usuário manda mensagem (texto ou áudio) pro WhatsApp do Tom; ele
categoriza gastos/receitas, organiza tarefas, metas pessoais/profissionais
e notas pessoais, lembra lembretes e datas importantes (aniversário etc.,
avisa sozinho todo ano), guarda documentos, agenda compromissos pessoais
ou profissionais no Google Agenda, lembra fatos que a pessoa contou
(memória de longo prazo), e tudo fica visível num dashboard web (consulta
+ algumas ações, como gerar/revogar chave de API e gerenciar webhook). Dado é escopado por **conta** (Fase 2,
`docs/adr/0002`), que pode ser compartilhada entre mais de um número de
WhatsApp (ex.: sócio, cônjuge). Desde a Fase 3 (`docs/adr/0003`), o Tom
também manda **insight proativo** (sem a pessoa perguntar) quando um
sinal financeiro real dispara, tem **programa de indicação**, e a conta
pode gerar **chave de API**/**webhooks** pra integração externa (só
leitura). Proatividade (não só reagir a comando) é o diferencial
central do produto — ver `CLAUDE.md` pra contexto completo de
escopo/roadmap.

## Como funciona

```
WhatsApp (Cloud API ou Evolution API) → webhook (Vercel)
  → fila (BullMQ/Redis) para áudio, documentos e ações lentas
  → orquestrador LLM (Claude, via tool use)
  → tools: financeiro, tarefas, lembretes, documentos, agenda, conta
  → Postgres (Supabase) + Storage (documentos)
  → resposta de volta pro usuário no WhatsApp
```

Regra não-negociável: a IA nunca persiste um dado financeiro "no
achismo" — toda transação/tarefa vira registro estruturado no banco
antes de qualquer confirmação ser enviada ao usuário. O mesmo vale pra
entrada numa conta compartilhada: nunca é decisão do LLM, só um código
de convite determinístico interceptado antes de qualquer chamada ao
modelo (`packages/core/src/llm/orchestrator.ts`).

## Estrutura do monorepo

```
apps/
  web/      Next.js — webhooks do WhatsApp, auth por magic link,
            dashboard do usuário, admin operacional em `/admin`
            (deploy: Vercel)
  worker/   Processa as filas BullMQ: transcrição de áudio,
            orquestração da IA, envio de lembretes (deploy: VPS Docker)
packages/
  core/     Orquestrador LLM (Claude + tools), filas, canal WhatsApp
            (Cloud API / Evolution API), contexto de curto prazo (Redis)
  db/       Cliente Supabase + repositórios + migrations SQL
deploy/
  worker/   Dockerfile + docker-compose + script de deploy do worker
  evolution/ Setup da Evolution API (canal WhatsApp alternativo)
```

### `packages/core/src`
- `llm/` — orquestrador, system prompt (persona do Tom), tools da IA
  (`llm/tools/`: financeiro, tarefas, lembretes, onboarding, acesso ao
  dashboard, conta/convite, documentos, agenda). `llm/providers/` —
  Claude (primário) com fallback automático pra OpenAI quando o
  Anthropic falha (créditos, rate limit, indisponibilidade); ver
  amendamento no `CLAUDE.md`.
- `whatsapp/` — abstração de canal (`cloud-api-channel.ts` /
  `evolution-channel.ts`), trocável via `WHATSAPP_CHANNEL_PROVIDER`
- `queues/` — definições das filas BullMQ
- `context/` — cache de idempotência em Redis (evita duplicar efeitos
  em retry)
- `audio/` — interface de transcrição (implementação real fica em
  `apps/worker/src/audio`)
- `calendar/` — camada de agenda multi-provider (2026-10, ver `CLAUDE.md`):
  `providers/google.ts`/`providers/microsoft.ts` fazem OAuth + chamada de
  API via fetch direto (sem SDK), `calendar-access.ts` despacha pro
  provider certo da conta (`calendar_connections.provider`) — tools e rotas
  do dashboard só chamam as funções genéricas daqui, nunca um provider
  específico direto
- `security/crypto.ts` — AES-256-GCM pra criptografar o refresh token da
  agenda conectada (Google ou Microsoft) em repouso (`TOKEN_ENCRYPTION_KEY`)
- `insights/` — detecção de sinal financeiro (agregação SQL
  determinística) + template de mensagem proativa (Fase 3, sem chamada
  nova ao LLM — ver `docs/adr/0003-*.md`)
- `webhooks/dispatch.ts` — enfileira (`enqueueWebhookEvent`) e entrega
  (`dispatchWebhookEvent`, assinado HMAC-SHA256) eventos pras
  assinaturas de webhook da conta
- `llm/web-search/`, `llm/embeddings/` — pesquisa autônoma do Tom e
  base de conhecimento (cache/RAG); ver amendamento "Pesquisa autônoma
  e aprendizado contínuo" no `CLAUDE.md`

### `apps/worker/src`
- `worker.ts` — os 10 workers BullMQ (um por fila de `QUEUE_NAMES`) (mensagem recebida, transcrição de
  áudio, disparo de lembrete, upload de documento, sweep + geração de
  insight proativo, disparo de webhook, resumo semanal/matinal, lembrete
  de data importante) — registra também o job repetível de sweep de
  insights (1x/hora) no boot
- `handlers/` — lógica de cada fila. `insights-sweep.ts` também roda,
  direto (sem fila/Worker própria), a manutenção semanal (pesquisa
  proativa, feedback de interpretação, expurgo de logs — gated por
  dia/hora UTC) e o reengajamento de onboarding (checado toda hora, gated
  por horas desde o cadastro) — 2026-10, análise de consumo de Redis: uma
  fila com job atrasado/repetível pendente fica presa 24/7 num teto de
  bloqueio de 10s do próprio BullMQ, desperdício grande pra algo que roda
  raro (semanal) ou não precisa de precisão ao minuto (nudge). Exceção:
  `reminder-dispatch` continua com delay nativo do BullMQ — lembrete
  precisa disparar na hora exata, decisão explícita do dono do produto.
  Detalhe completo em `CLAUDE.md`.
- `audio/` — pipeline Whisper (Groq → Groq full → OpenAI, com detector
  de alucinação) e conversão de áudio via ffmpeg

### `packages/db/migrations`
`0001_init.sql` (schema base) → `0002_enable_rls.sql` (RLS como defesa
em profundidade) → `0003_reminder_failed_status.sql` (status `failed`
em lembretes) → `0004_admin.sql` (`webhook_events`, `error_logs`,
`users.plan_status` — suporte ao admin em `/admin`) → `0005_accounts.sql`
(Fase 2: `accounts`/`account_members`/`account_invites`, migra
transactions/tasks/reminders de `user_id` pra `account_id` como escopo)
→ `0006_documents.sql` (`documents` + bucket de Storage) →
`0007_calendar.sql` (`calendar_connections`) → `0008_proactive_insights.sql`
(`proactive_insight_logs`) → `0009_referrals.sql` (`accounts.referral_code`
+ `referrals`) → `0010_public_api.sql` (`api_keys`, `webhook_subscriptions`,
`webhook_delivery_logs`) → `0011_knowledge_base.sql` (`pgvector`,
`knowledge_entries`, `interpretation_insights` — pesquisa autônoma e loop
de feedback, ver `CLAUDE.md`) → `0012_plan_intent.sql`
(`users.plan_intent`/`plan_intent_requested_at` — captura de intenção de
assinar/cancelar, momento de venda do Tom, ver `docs/adr/0004-*.md`) →
`0013_review_improvements.sql` (`tool_call_logs.duration_ms`,
`reminders.recurrence`, `weekly_digest_logs`, `budgets` — lembrete
recorrente, resumo semanal proativo e alerta de orçamento por categoria) →
`0014_tom_persona.sql` (`users.preferred_name` — apelido/forma de chamar a
pessoa, parte da rodada de personalidade do Tom, ver
`docs/tools-contrato.md`) → `0015_onboarding_improvements.sql`
(`users.occupation`/`onboarding_variant` — ocupação opcional e variante de
abertura A/B, ver `docs/adr/0005-*.md`) → `0016_admin_action_logs.sql`
(`admin_action_logs` — auditoria de escrita feita a partir do painel
admin, ver seção Admin abaixo) → `0017_memory_notes.sql` (`memory_facts`
— o Tom lembrando algo sobre a pessoa, via `remember_fact`/`forget_fact`
— e `notes` — nota pessoal livre, via `create_note`/`list_notes`/
`delete_note` — posicionamento reafirmado 2026-10, ver `CLAUDE.md`) →
`0018_personal_assistant_expansion.sql` (`important_dates` — data
recorrente/aniversário via `remember_important_date`, lembrada sozinha
todo ano; `personal_goals` — meta pessoal/profissional qualitativa via
`create_personal_goal`; `important_date_logs` — idempotência do lembrete
anual — expansão B2C 2026-10, ver `CLAUDE.md`) →
`0019_personal_assistant.sql` (`users.quiet_hours_start`/`quiet_hours_end`
— horário de silêncio pra mensagem proativa; `recurring_bills` — conta
que se repete todo mês, aviso antecipado via `create_recurring_bill`;
`goals` — meta com valor e prazo via `create_goal`/`add_goal_progress`,
separada de `personal_goals`, que é qualitativa) →
`0020_billing_asaas.sql` (`users.cpf_cnpj`/`asaas_customer_id`/
`asaas_subscription_id`/`asaas_payment_link` — checkout real de
assinatura via Asaas, R$ 27,90/mês, ver amendamento 2026-10 em
`docs/adr/0004-*.md`) →
`0021_cadastro_progressivo.sql` (`users.email`/`quiet_hours_confirmed_at`/
`preferred_payment_method` — cadastro progressivo ao longo do teste (7 dias na época; hoje 3, ver
`0023`) via `update_occupation`/`set_email`/`set_quiet_hours`; método de
pagamento salvo sozinho pelo webhook da Asaas, nunca perguntado em
conversa — ver `CLAUDE.md`) →
`0022_calendar_multi_provider.sql` (`calendar_connections.provider` +
renomeia `google_refresh_token_encrypted`/`google_calendar_id` pra
`refresh_token_encrypted`/`calendar_id` — integração com Outlook além do
Google, uma agenda conectada por conta, ver `CLAUDE.md`) →
`0023_trial_3_dias.sql` (`users.trial_ends_at` — trial vira 3 dias com
bloqueio real de uso fora do LLM, era 7 dias sem bloqueio nenhum; ver
`packages/core/src/payments/trial-gate.ts` e `CLAUDE.md`) →
`0022_task_follow_up.sql` (`tasks.follow_up_asked_at` — pergunta de
conclusão de tarefa atrasada; tem o mesmo prefixo `0022` da migration de
agenda, mas é independente e idempotente, a ordem entre as duas não
importa) → `0024_morning_digest_prefs.sql` (cidade real e preferências do
resumo matinal) → `0025_habits.sql` (`habits`/`habit_checkins`) →
`0026_semantic_search_and_document_reading.sql` (busca semântica em notas
e documentos, leitura de foto/PDF) → `0027_contacts_and_message_drafts.sql`
(`contacts`/`message_drafts` — recados que o Tom redige e a pessoa envia,
ver `docs/adr/0007-*.md`) → `0028_tom_capabilities.sql` (listas, parcelas,
resumo rolante da conversa, `proactive_message_logs`, `routine_*` de
`users`, ver `docs/adr/0009-*.md`) → `0029_morning_digest_indicators.sql`
(`users.morning_digest_indicators` — indicadores econômicos no bom dia) → `0030_curation_reviews.sql` (`curation_reviews` — vereditos da curadoria das interações em `/admin/curadoria`, ver `docs/adr/0011-*.md`).
Rodar em ordem, manualmente, no
SQL Editor do Supabase. **O worker em produção seleciona colunas das
migrations mais recentes: aplicar a migration ANTES de dar deploy do código
que a usa** (deploy do worker é automático em push na `main`). Ver `docs/adr/0002-*.md`, `docs/adr/0003-*.md`,
`docs/adr/0004-*.md` e `docs/adr/0005-*.md` pras decisões por trás das
Fases 2, 3, do momento de venda/indicação e do onboarding turbinado.

### Admin (`/admin`)

Painel operacional interno — não é feature de produto do MVP, é
observabilidade pra operar o Tom. Login por senha única
(`ADMIN_PASSWORD`, sem usuário), cookie de sessão separado do
dashboard de clientes (`apps/web/lib/admin-session.ts`).

- **Visão geral** (`/admin`): visitas (hits nos webhooks, aceitos vs.
  rejeitados), chamadas (tool calls da IA, hoje/7 dias, taxa de
  falha), contatos (total, novos), funil de onboarding por variante
  (cadastros, completos, taxa, estagnados há mais de 24h, tempo médio
  até completar — ver `docs/adr/0005-*.md`), assinaturas (contagem por
  `plan_status` — manual, sem billing real ainda — e pedidos de
  assinatura aguardando contato, de `register_plan_intent`, ver
  `docs/adr/0004-*.md`), erros (unifica
  `error_logs` + tool calls falhas + lembretes travados, com link
  pra lembretes travados filtrados), fila (contagem de jobs por
  status direto do BullMQ/Redis), infraestrutura (conectividade do
  Redis, contagem de linhas por tabela).
- **Contatos** (`/admin/contacts`): lista paginada e buscável, com
  ocupação capturada no onboarding (quando mencionada), troca manual de
  `plan_status` por contato e o sinal de intenção (`plan_intent` —
  "quer assinar"/"quer cancelar") que o Tom captura na conversa; cada
  linha abre o detalhe do contato.
- **Detalhe do contato** (`/admin/contacts/[id]`): dados do usuário +
  troca de `plan_status`, últimas transações, tarefas, lembretes e
  chamadas da IA daquele contato específico — drill-down que a lista
  geral não dá.
- **Chamadas** (`/admin/calls`): log paginado por cursor (não por
  número de página — ver `listToolCallLogsCursorPage`) de
  `tool_call_logs`, filtrável por sucesso/falha, `tool_name` e contato
  (`userId`); exporta CSV (até 5000 linhas mais recentes do filtro).
- **Lembretes** (`/admin/reminders`): lista paginada e ordenável (por
  disparo ou status) de todos os lembretes, filtrável por status;
  lembrete `pending`/`failed` pode ser cancelado manualmente pelo
  admin (com confirmação); exporta CSV.
- **Erros** (`/admin/errors`): lista unificada das últimas falhas de
  cada fonte (webhook, worker, orchestrator, tool call, lembrete);
  exporta CSV.
- **Status** (`/admin/status`): card visual (online/indisponível) de
  cada serviço que o Tom depende — banco (Supabase), fila
  (Redis/BullMQ), WhatsApp (número conectado no canal ativo) e worker
  (via heartbeat no Redis, já que roda em processo separado da web).
- **WhatsApp** (`/admin/whatsapp`): gestão da instância Evolution
  (só quando `WHATSAPP_CHANNEL_PROVIDER=evolution`) — criar, gerar QR
  code de pareamento e excluir, sempre restrito à instância configurada
  em `EVOLUTION_INSTANCE_NAME` (nunca aceita nome de instância vindo de
  fora, já que essa Evolution é compartilhada com o ZapScript).
- **Auditoria** (`/admin/audit`): log de toda escrita feita a partir do
  admin (`admin_action_logs`) — plan_status, cancelamento de lembrete,
  criação/exclusão de instância Evolution. Sem conta por admin ainda
  (login é senha única): registra o quê e quando, não ainda quem.

Visão geral e contatos ganham sparkline dos últimos 14 dias (chamadas,
novos contatos, chamadas falhas); as estatísticas agregadas da visão
geral são cacheadas por 30s (`unstable_cache`) e renderizadas em
`<Suspense>` separado da seção de fila/Redis, pra uma falha ali não
travar o resto da página.

### API pública (Fase 3, `docs/adr/0003-*.md`)

Só leitura, de propósito (ver ADR pro motivo de não ter escrita pública). Chave de API e
assinatura de webhook são criadas pelo dashboard (seção "API e webhooks"), nunca pelo WhatsApp.

```
GET /api/v1/transactions?from=<iso>&to=<iso>   Authorization: Bearer <chave>
GET /api/v1/tasks?status=pending|completed     Authorization: Bearer <chave>
```

Webhooks: `transaction.created` e `task.completed`, POST assinado (`X-ZapBuddy-Signature:
sha256=<hmac>`, segredo é o mesmo gerado na criação da assinatura).

## Stack

Node.js + TypeScript · Next.js (App Router) · Supabase (Postgres +
Auth) · BullMQ + Redis · Claude (Anthropic) · WhatsApp Cloud API
(canal padrão) ou Evolution API (canal alternativo/contingência) ·
Groq/OpenAI Whisper (transcrição de áudio). Decisões de stack são
fixas — ver `CLAUDE.md`.

## Rodando localmente

Pré-requisito: Node.js 22+ (o worker depende disso — ver nota no
`deploy/worker/Dockerfile`).

```bash
npm install
cp .env.example .env   # preenche com suas chaves (ver seção abaixo)

npm run dev:web        # apps/web em http://localhost:3000
npm run dev:worker      # apps/worker consumindo as filas

npm run typecheck      # tsc --noEmit em todos os workspaces
npm test                # vitest — lógica pura (categorias, timezone, sessão, whisper, insights)
npm run build           # build de produção de todos os workspaces
```

### Interruptores de produto (painel e cobrança)

`DASHBOARD_ENABLED` e `BILLING_ENABLED` (`packages/core/src/features.ts`) estão
**desligados por padrão** — ordem do dono do produto, ver
`docs/adr/0008-onboarding-sem-painel-e-sem-cobranca.md`. Desligados: o site mostra a
landing em `/` (`docs/adr/0010-landing-page.md`) e "painel indisponível" nas telas do
painel; ninguém é bloqueado por trial; o Tom não fala de preço, teste, painel nem link
de acesso. Para religar: variável `true` no worker (`deploy/worker/.env`) **e** na
Vercel, mais redeploy. As seções de painel, dashboard e cobrança deste README descrevem
o que existe no código, não necessariamente o que está ligado.

### Variáveis de ambiente

Ver `.env.example` pra lista completa e comentada. Resumo do que é
obrigatório:

| Variável | Pra quê |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Banco |
| `REDIS_URL` | Fila BullMQ (precisa ser alcançável tanto pelo webhook na Vercel quanto pelo worker — um serviço gerenciado com TLS, ex. Upstash, não um Redis isolado atrás de firewall) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Orquestrador (Tom) |
| `WHATSAPP_CHANNEL_PROVIDER` | `cloud-api` (default, único aprovado p/ produção) ou `evolution` |
| `WHATSAPP_*` ou `EVOLUTION_*` | Credenciais do canal escolhido |
| `GROQ_API_KEY` e/ou `OPENAI_API_KEY` | Transcrição de áudio (pelo menos uma) |
| `WEB_APP_URL`, `SESSION_SECRET` | Dashboard e magic link |
| `ADMIN_PASSWORD` | Login do painel admin (`/admin`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Fase 2 — OAuth do Google Agenda. Sem isso, o botão "Conectar Google Agenda" do dashboard falha |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI` | 2026-10 — OAuth do Outlook. Sem isso, o botão "Conectar Outlook" falha de forma controlada, sem afetar o Google |
| `TOM_WHATSAPP_NUMBER` | Número real do WhatsApp do Tom (só dígitos). Monta o link `wa.me` da landing e da indicação; sem ele a landing não gera link quebrado |
| `TOKEN_ENCRYPTION_KEY` | Criptografa o refresh token da agenda conectada (Google ou Microsoft) em repouso — obrigatório se qualquer uma for usada. Sem nenhuma conectada, `create_calendar_event`/`list_calendar_events` sempre retornam `connected: false` |

## Deploy

- **`apps/web`**: Vercel, Root Directory = `apps/web`, Framework =
  Next.js. SSO Protection da Vercel precisa estar desligado (bloqueia
  webhook e magic link). **Production Branch do projeto precisa ser
  `main`** (Settings → Git) — já aconteceu de ficar apontando pra uma
  branch de sessão antiga, e nesse caso push em `main` nunca promove pro
  domínio real (fica só como preview `zapbuddy-git-main-*.vercel.app`),
  quebrando a premissa do CLAUDE.md de `main` ser o único ponto de
  integração. Depois de corrigir o Production Branch, um commit genuíno
  novo em `main` é necessário pra promover — o "Ignored Build Step"
  (`apps/web/vercel.json`) compara contra o SHA anterior, então
  reempurrar o mesmo commit (redeploy/force) é visto como "sem
  diferença" e fica `CANCELED` em vez de promover.
- **`apps/worker`**: não roda na Vercel (processo contínuo). Ver
  `deploy/worker/README.md` — Docker, 1 container, sem Redis próprio
  (usa o mesmo Redis gerenciado do webhook).
- **Canal Evolution API** (se usado): ver `deploy/evolution/README.md`
  e `deploy/evolution/REUSE-ZAPSCRIPT-INSTANCE.md` (inclui como gerar
  QR code de conexão e reconectar o número).

## Testes

`npm test` roda a suíte vitest (80+ arquivos, 700+ testes) — cobre lógica pura sem
dependências externas (categorias, timezone, sessão, Whisper, insights, resumo matinal,
comandos, regras de copy da landing, SSRF, orçamento de tokens das tools).
O CI (`.github/workflows/ci.yml`) roda typecheck, testes, build do web e
`npm audit` de produção (bloqueia só em nível crítico).
**Eval do prompt** (golden set, 66 casos sintéticos): a validação estática roda no `npm test`; a execução contra o modelo real
é manual — `npm run eval:golden` (precisa de `ANTHROPIC_API_KEY`) ou o workflow "Eval do golden set" no GitHub. Ver `docs/adr/0011-*.md`. Não cobre integração real com Claude/Supabase/WhatsApp
nem a detecção de sinal em si (depende de `summarizeTransactions` no
banco) — isso é validado manualmente, ponta a ponta, mandando mensagem
pro número conectado.
