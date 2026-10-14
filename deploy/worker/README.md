# Deploy do worker (apps/worker) em VPS Vultr dedicada

## Por que uma VPS nova, separada do Evolution API

A instância `evo.zapscript.me` já roda em produção o Evolution API do
**ZapScript** (produto com usuários reais). Colocar o worker + Redis do
ZapBuddy na mesma máquina significa que um problema de recurso (CPU/RAM,
disco cheio pelo Redis, um crash do worker) pode afetar o ZapScript também.
Numa fase de MVP ainda não validado, isolar é mais importante que
economizar ~$6/mês — por isso a recomendação é uma VPS nova e pequena,
só pra isto.

## O que este deploy sobe

- **Redis** (`redis:7-alpine`, container, sem porta exposta pra fora da
  VPS — só o worker acessa, pela rede interna do Docker). Resolve o
  `REDIS_URL` pendente sem depender de serviço externo (Upstash).
- **worker** (`apps/worker`, roda via `tsx` — sem build step, TS direto),
  conectado ao Redis acima e à mesma Supabase/Claude/WhatsApp configurados
  na Vercel.

Nenhuma porta precisa ficar aberta pro público nesta VPS: o worker só
faz conexões de saída (Redis local, Supabase, Anthropic, WhatsApp
Cloud API/Evolution). Diferente do Evolution API, não há webhook de
entrada aqui.

## Passo a passo

1. **Criar a VPS**: no painel Vultr, uma instância nova (menor plano
   serve — 1 vCPU / 1GB RAM é suficiente pro worker + Redis no volume
   de mensagens de um MVP). Ubuntu 22.04 ou 24.04.

2. **Acesso ao repositório privado**: como `foxtecnologiaonline/Zapbuddy`
   é privado, a VPS precisa de credencial pra `git clone`. Mais simples:
   gere um Personal Access Token (GitHub → Settings → Developer settings
   → Fine-grained tokens, só leitura do repo) e use:
   ```
   export REPO_URL="https://<SEU_TOKEN>@github.com/foxtecnologiaonline/Zapbuddy.git"
   ```
   antes de rodar o script (passo 3), ou exporte `BRANCH` se quiser
   implantar a partir do branch atual (`ccr-b58dbd31-9tcfcw`) antes de
   mergear pra `main`:
   ```
   export BRANCH="ccr-b58dbd31-9tcfcw"
   ```

3. **Rodar o script** (via SSH ou console web do Vultr, como root):
   ```
   curl -fsSL https://raw.githubusercontent.com/foxtecnologiaonline/Zapbuddy/main/deploy/worker/setup.sh -o setup.sh
   chmod +x setup.sh
   ./setup.sh
   ```
   Na primeira execução ele só cria `deploy/worker/.env` a partir do
   exemplo e para — ele avisa isso explicitamente.

4. **Preencher o `.env`**:
   ```
   nano /opt/zapbuddy/deploy/worker/.env
   ```
   Mesmos valores já configurados na Vercel (`SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, canal WhatsApp,
   `GROQ_API_KEY`/`OPENAI_API_KEY`). **Não** preencha `REDIS_URL` — o
   `docker-compose.yml` já aponta pro Redis interno.

5. **Rodar o script de novo** — agora ele builda a imagem e sobe os
   containers:
   ```
   ./setup.sh
   ```

6. **Verificar**:
   ```
   cd /opt/zapbuddy/deploy/worker
   docker compose ps          # os 2 containers devem estar "Up"
   docker compose logs -f worker   # confirma conexão com Redis/Supabase sem erro
   ```

## Atualizar depois de um novo push

```
cd /opt/zapbuddy/deploy/worker
git -C /opt/zapbuddy pull origin <branch>
docker compose up -d --build
```

## Troubleshooting

- `docker compose logs worker` mostra `REDIS_URL must be set` → o
  `.env` não tem as outras vars preenchidas corretamente ou o container
  não leu o `environment:` do compose — rode `docker compose config`
  pra conferir o que foi resolvido.
- Mensagens não chegam no worker → confirme que `WHATSAPP_CHANNEL_PROVIDER`
  e os vars do canal escolhido são **idênticos** aos da Vercel (o webhook
  roda na Vercel, só a fila/processamento é que está aqui).
- `npm ci` falha no build → o `package-lock.json` do branch clonado
  precisa estar em sync com os `package.json` dos workspaces; rode
  `npm install` localmente e commite o lockfile atualizado antes de
  reimplantar.
