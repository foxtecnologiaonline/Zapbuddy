# ZapBuddy

Assistente financeiro e de produtividade via WhatsApp para autônomos e
pequenos negócios (MEI/PJ). O nome do assistente que o usuário vê é
**Tom** — "ZapBuddy" é o produto/plataforma, "Tom" é a persona de IA
dentro dele.

O usuário manda mensagem (texto ou áudio) pro WhatsApp do Tom; ele
categoriza gastos/receitas, organiza tarefas e lembretes, e tudo fica
visível num dashboard web read-only. Proatividade (não só reagir a
comando) é o diferencial central do produto — ver `CLAUDE.md` pra
contexto completo de escopo/roadmap.

## Como funciona

```
WhatsApp (Cloud API ou Evolution API) → webhook (Vercel)
  → fila (BullMQ/Redis) para áudio e ações lentas
  → orquestrador LLM (Claude, via tool use)
  → tools: financeiro, tarefas, lembretes
  → Postgres (Supabase)
  → resposta de volta pro usuário no WhatsApp
```

Regra não-negociável: a IA nunca persiste um dado financeiro "no
achismo" — toda transação/tarefa vira registro estruturado no banco
antes de qualquer confirmação ser enviada ao usuário.

## Estrutura do monorepo

```
apps/
  web/      Next.js — webhooks do WhatsApp, auth por magic link,
            dashboard read-only (deploy: Vercel)
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
  dashboard). `llm/providers/` — Claude (primário) com fallback automático
  pra OpenAI quando o Anthropic falha (créditos, rate limit,
  indisponibilidade); ver amendamento no `CLAUDE.md`.
- `whatsapp/` — abstração de canal (`cloud-api-channel.ts` /
  `evolution-channel.ts`), trocável via `WHATSAPP_CHANNEL_PROVIDER`
- `queues/` — definições das filas BullMQ
- `context/` — cache de idempotência em Redis (evita duplicar efeitos
  em retry)
- `audio/` — interface de transcrição (implementação real fica em
  `apps/worker/src/audio`)

### `apps/worker/src`
- `worker.ts` — os 3 workers BullMQ (mensagem recebida, transcrição de
  áudio, disparo de lembrete)
- `handlers/` — lógica de cada fila
- `audio/` — pipeline Whisper (Groq → Groq full → OpenAI, com detector
  de alucinação) e conversão de áudio via ffmpeg

### `packages/db/migrations`
`0001_init.sql` (schema base) → `0002_enable_rls.sql` (RLS como defesa
em profundidade) → `0003_reminder_failed_status.sql` (status `failed`
em lembretes). Rodar em ordem, manualmente, no SQL Editor do Supabase.

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
npm test                # vitest — lógica pura (categorias, timezone, sessão, whisper)
npm run build           # build de produção de todos os workspaces
```

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

## Deploy

- **`apps/web`**: Vercel, Root Directory = `apps/web`, Framework =
  Next.js. SSO Protection da Vercel precisa estar desligado (bloqueia
  webhook e magic link).
- **`apps/worker`**: não roda na Vercel (processo contínuo). Ver
  `deploy/worker/README.md` — Docker, 1 container, sem Redis próprio
  (usa o mesmo Redis gerenciado do webhook).
- **Canal Evolution API** (se usado): ver `deploy/evolution/README.md`
  e `deploy/evolution/REUSE-ZAPSCRIPT-INSTANCE.md` (inclui como gerar
  QR code de conexão e reconectar o número).

## Testes

`npm test` roda a suíte vitest — cobre lógica pura sem dependências
externas (normalização de categoria, matemática de timezone, sessão de
auth, heurística de detecção de alucinação do Whisper). Não cobre
integração real com Claude/Supabase/WhatsApp — isso é validado
manualmente, ponta a ponta, mandando mensagem pro número conectado.
