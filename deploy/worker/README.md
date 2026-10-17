# Deploy do worker (apps/worker) na VPS Vultr atual (evo.zapscript.me)

## Por que o Redis é externo (Upstash), não self-hosted nesta VPS

O webhook do WhatsApp roda na **Vercel** (`apps/web`) e enfileira jobs
direto no Redis via BullMQ — ele nunca chama o worker por HTTP (ver
`packages/core/src/queues/definitions.ts`). Isso significa que Vercel e
o worker nesta VPS precisam alcançar **o mesmo Redis**, de dois lugares
diferentes na internet. Um Redis containerizado nesta VPS sem porta
pública seria inalcançável pela Vercel; com porta pública, seria um
Redis exposto na internet protegido só por senha, sem TLS — risco real
pra mensagens com dado financeiro em trânsito.

Por isso o Redis é um serviço gerenciado com TLS nativo (Upstash —
free tier cobre o volume de um MVP), e `REDIS_URL` é a **mesma URL**
setada na Vercel e aqui. Isso também simplifica esta VPS: só 1
container (`zapbuddy-worker`), sem Redis, sem volume, sem Postgres.

## Coexistindo com o ZapScript nesta VPS

Essa VPS já roda o stack de produção do **ZapScript**: Nginx, a
Evolution API compartilhada, Postgres e Redis *dele* (ver
`deploy/evolution/REUSE-ZAPSCRIPT-INSTANCE.md`) — não tem relação com o
Redis do ZapBuddy acima. Este deploy foi desenhado pra não tocar em
nada do stack do ZapScript:

- **Projeto Compose próprio** (`name: zapbuddy-worker`), `container_name`
  explícito (`zapbuddy-worker`) — nenhum nome colide com os containers
  do ZapScript.
- **Nenhuma porta exposta** e **nenhuma mudança no Nginx**: o worker só
  faz chamadas de *saída* (Redis/Upstash, Supabase, Anthropic,
  Groq/OpenAI, e `https://evo.zapscript.me` — o mesmo endpoint público
  que a Vercel já usa). Não há webhook de entrada aqui.
- **`/opt/zapbuddy`**, separado de `/opt/zapscript`.

O que **é** compartilhado, por ser da própria VPS: CPU, RAM e disco. É
por isso que o `setup.sh` mostra o uso de recursos antes e depois de
subir o container (passos 0 e 5) — confira que não aperta o que o
ZapScript já usa.

## Passo a passo

0. **Criar o Redis (Upstash)**, se ainda não tiver: upstash.com → Redis
   → Create Database → região `us-east-1` (mais perto da Vercel/iad1) →
   copie a connection string `rediss://...` (TLS). Essa é a `REDIS_URL`
   que vai nos dois lugares: Vercel e `.env` desta VPS.

1. **Acesso ao repositório privado**: como `foxtecnologiaonline/Zapbuddy`
   é privado, a VPS precisa de credencial pra `git clone`. Gere um
   Personal Access Token (GitHub → Settings → Developer settings →
   Fine-grained tokens, só leitura do repo) e use:
   ```
   export REPO_URL="https://<SEU_TOKEN>@github.com/foxtecnologiaonline/Zapbuddy.git"
   ```
   antes de rodar o script, ou exporte `BRANCH` se quiser implantar a
   partir do branch atual (`ccr-b58dbd31-9tcfcw`) antes de mergear pra
   `main`:
   ```
   export BRANCH="ccr-b58dbd31-9tcfcw"
   ```

2. **Rodar o script** (via SSH ou console web do Vultr, como root):
   ```
   curl -fsSL https://raw.githubusercontent.com/foxtecnologiaonline/Zapbuddy/main/deploy/worker/setup.sh -o setup.sh
   chmod +x setup.sh
   ./setup.sh
   ```
   O PASSO 0 mostra RAM/disco livres e os containers já rodando — me
   cola essa saída se quiser que eu confirme se há espaço de sobra antes
   de prosseguir. Na primeira execução completa, o script só cria
   `deploy/worker/.env` a partir do exemplo e para (ele avisa isso
   explicitamente).

3. **Preencher o `.env`**:
   ```
   nano /opt/zapbuddy/deploy/worker/.env
   ```
   `REDIS_URL` é a connection string do Upstash (passo 0) — a mesma
   que você vai setar na Vercel. O resto é espelho do que está lá
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
   canal WhatsApp, `GROQ_API_KEY`/`OPENAI_API_KEY`). Se o canal for
   `evolution`, os valores de `EVOLUTION_*` são os mesmos já usados pela
   instância `zapbuddy` em `evo.zapscript.me`.

4. **Rodar o script de novo** — agora ele builda a imagem e sobe o
   container:
   ```
   ./setup.sh
   ```

5. **Verificar**:
   ```
   cd /opt/zapbuddy/deploy/worker
   docker compose ps                  # zapbuddy-worker "Up"
   docker compose logs -f worker      # confirma conexão com Redis/Supabase sem erro
   docker ps --format 'table {{.Names}}\t{{.Status}}'   # confirma que os containers do ZapScript continuam intactos
   ```

## Atualizar depois de um novo push

**Automático (recomendado):** `.github/workflows/deploy-worker.yml` roda isto
sozinho a cada push em `main` que toque `packages/core`, `packages/db` ou
`apps/worker` — motivo: nenhum deploy da Vercel chega até aqui (ver seção
acima), então sem isso o worker fica preso no commit do último `docker
compose up` manual, por tempo indefinido. Requer 3-4 secrets no repo GitHub
(Settings → Secrets and variables → Actions):

- `WORKER_VPS_HOST` — IP/hostname da VPS
- `WORKER_VPS_USER` — usuário SSH (o mesmo usado pra rodar `setup.sh`)
- `WORKER_VPS_SSH_KEY` — chave privada de uma chave **dedicada ao deploy**
  (gere com `ssh-keygen -t ed25519 -f deploy_key -N ""`, adicione a pública
  em `~/.ssh/authorized_keys` do usuário acima nesta VPS, e cole o
  conteúdo da privada neste secret — nunca reaproveite sua chave pessoal)
- `WORKER_VPS_PORT` (opcional, default `22`)

Pode disparar manualmente também, sem esperar um push: aba Actions → "Deploy
worker (VPS)" → Run workflow.

**Manual (fallback, se o workflow falhar ou a VPS estiver inacessível pra
runners do GitHub):**

```
cd /opt/zapbuddy
git pull origin main
cd deploy/worker
docker compose up -d --build
```

## Troubleshooting

- `docker compose logs worker` mostra `REDIS_URL must be set` → o
  `.env` não tem `REDIS_URL` preenchido, ou o `env_file` não foi lido —
  rode `docker compose config` pra conferir o que foi resolvido.
- Erro de conexão/TLS com o Redis → confirme que a `REDIS_URL` começa
  com `rediss://` (TLS), não `redis://` — Upstash exige TLS por padrão.
- Mensagens não chegam no worker → confirme que `REDIS_URL` e
  `WHATSAPP_CHANNEL_PROVIDER`/vars do canal são **idênticos** aos da
  Vercel (o webhook roda na Vercel; a fila/processamento é que está
  aqui, e os dois só se conectam através do mesmo Redis).
- Containers do ZapScript pararam ou reiniciaram depois do `docker
  compose up` do worker → **isso não deveria acontecer** (projeto
  Compose isolado, nenhum nome de rede/container em comum); se
  acontecer, rode `docker compose -p zapbuddy-worker down` aqui pra
  reverter e me avisa com a saída de `docker ps -a` pra eu investigar.
- `npm ci` falha no build → o `package-lock.json` do branch clonado
  precisa estar em sync com os `package.json` dos workspaces; rode
  `npm install` localmente e commite o lockfile atualizado antes de
  reimplantar.
