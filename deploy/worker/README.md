# Deploy do worker (apps/worker) na VPS Vultr atual (evo.zapscript.me)

## Coexistindo com o ZapScript nesta VPS

Essa VPS já roda o stack de produção do **ZapScript**: Nginx, a Evolution
API compartilhada, Postgres e Redis dele (ver
`deploy/evolution/REUSE-ZAPSCRIPT-INSTANCE.md`). Este deploy do worker do
ZapBuddy foi desenhado pra não tocar em nada disso:

- **Projeto Compose próprio** (`name: zapbuddy-worker` no
  `docker-compose.yml`), com `container_name` explícito
  (`zapbuddy-redis`, `zapbuddy-worker`) e rede Docker própria
  (`zapbuddy-net`) — nenhum nome colide com os containers do ZapScript,
  e os dois stacks não se enxergam na rede Docker.
- **Redis próprio** (container `zapbuddy-redis`), não o Redis que a
  Evolution API já usa internamente — evita que o volume de filas do
  BullMQ (potencialmente alto, por mensagem) dispute memória ou chaves
  com o cache da Evolution.
- **Nenhuma porta nova exposta** e **nenhuma mudança no Nginx**: o worker
  só faz chamadas de *saída* (pro Redis próprio, Supabase, Anthropic,
  Groq/OpenAI, e pra `https://evo.zapscript.me` — o mesmo endpoint
  público que a Vercel já usa). Diferente da Evolution API, não há
  webhook de entrada aqui.
- **`/opt/zapbuddy`**, separado de `/opt/zapscript`.

O que **é** compartilhado, porque é da própria VPS, e não do Docker:
CPU, RAM e disco. É por isso que o `setup.sh` mostra o uso de recursos
antes e depois de subir os containers (passos 0 e 5) — confira que não
aperta o que o ZapScript já usa. Se a VPS for pequena (1 vCPU/1GB) e o
volume de mensagens do ZapBuddy crescer, pode valer migrar o worker pra
uma VPS própria depois — a troca é só trocar `REPO_URL`/rodar o mesmo
`setup.sh` noutro host, nenhuma mudança de código.

## Passo a passo

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
   Mesmos valores já configurados na Vercel (`SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, canal WhatsApp,
   `GROQ_API_KEY`/`OPENAI_API_KEY`). **Não** preencha `REDIS_URL` — o
   `docker-compose.yml` já aponta pro Redis próprio (`zapbuddy-redis`).
   Se o canal for `evolution`, os valores de `EVOLUTION_*` são os
   mesmos já usados pela instância `zapbuddy` em `evo.zapscript.me`.

4. **Rodar o script de novo** — agora ele builda a imagem e sobe os
   containers:
   ```
   ./setup.sh
   ```

5. **Verificar**:
   ```
   cd /opt/zapbuddy/deploy/worker
   docker compose ps                  # zapbuddy-redis e zapbuddy-worker "Up"
   docker compose logs -f worker      # confirma conexão com Redis/Supabase sem erro
   docker ps --format 'table {{.Names}}\t{{.Status}}'   # confirma que os containers do ZapScript continuam intactos
   ```

## Atualizar depois de um novo push

```
cd /opt/zapbuddy
git pull origin <branch>
cd deploy/worker
docker compose up -d --build
```

## Troubleshooting

- `docker compose logs worker` mostra `REDIS_URL must be set` → o
  `.env` não tem as outras vars preenchidas corretamente, ou o
  container não leu o `environment:` do compose — rode
  `docker compose config` pra conferir o que foi resolvido.
- Mensagens não chegam no worker → confirme que `WHATSAPP_CHANNEL_PROVIDER`
  e os vars do canal escolhido são **idênticos** aos da Vercel (o webhook
  roda na Vercel; a fila/processamento é que está aqui).
- Containers do ZapScript pararam ou reiniciaram depois do `docker compose
  up` do worker → **isso não deveria acontecer** (projetos Compose
  isolados, nenhum nome de rede/container em comum); se acontecer, rode
  `docker compose -p zapbuddy-worker down` aqui pra reverter e me avisa
  com a saída de `docker ps -a` pra eu investigar.
- `npm ci` falha no build → o `package-lock.json` do branch clonado
  precisa estar em sync com os `package.json` dos workspaces; rode
  `npm install` localmente e commite o lockfile atualizado antes de
  reimplantar.
