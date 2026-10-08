# Evolution API — canal opcional/fallback do ZapBuddy

**Isto não é o canal default.** Ver `CLAUDE.md` (amendamento 2026-10): produção com
usuários reais deve ficar em `WHATSAPP_CHANNEL_PROVIDER=cloud-api`. Isto existe
para staging ou contingência operacional.

Mesma stack que o ZapScript já roda em produção (`evoapicloud/evolution-api` —
Baileys self-hosted), adaptada para o ZapBuddy.

**Já tem uma Evolution API rodando (ex. a do ZapScript no Vultr)?** Não suba
uma nova — veja `REUSE-ZAPSCRIPT-INSTANCE.md` nesta pasta pra reaproveitar a
existente (só expõe a porta publicamente num subdomínio dedicado e cria uma
instância nova dentro dela). O passo a passo abaixo (`setup.sh`) é só pra quem
vai subir uma stack do zero.

## Pré-requisitos

- Uma VPS com IP público (Ubuntu 22.04+), portas 80/443 liberadas na rede
  (security group/VCN, além do firewall do SO).
- Um domínio ou subdomínio seu, com um registro DNS tipo A apontando pro IP da VPS
  (ex.: `evo.seudominio.com`).

## Passo a passo

```bash
# 1) Na VPS, clone ou copie esta pasta (deploy/evolution) pra lá.
cd deploy/evolution
cp .env.example .env
nano .env   # preencha DOMAIN, AUTHENTICATION_API_KEY (openssl rand -hex 32),
            # POSTGRES_PASSWORD (openssl rand -hex 24)

# 2) Bootstrap (abre firewall, instala Docker, sobe a stack)
chmod +x setup.sh create-instance.sh
./setup.sh

# 3) Acompanhe o certificado SSL
docker compose logs -f caddy
# espere aparecer "certificate obtained"

# 4) Crie a instância e registre o webhook do ZapBuddy
./create-instance.sh zapbuddy https://zapbuddy.vercel.app SEU_SECRET_AQUI
# escaneie o QR Code impresso no terminal com o WhatsApp do número que vai usar

# 5) No ambiente do ZapBuddy (Vercel + worker), configure:
#    WHATSAPP_CHANNEL_PROVIDER=evolution
#    EVOLUTION_API_URL=https://evo.seudominio.com
#    EVOLUTION_API_KEY=<o AUTHENTICATION_API_KEY do .env>
#    EVOLUTION_INSTANCE_NAME=zapbuddy
#    EVOLUTION_WEBHOOK_SECRET=SEU_SECRET_AQUI  (mesmo valor do passo 4)
```

## Teste

Mande uma mensagem de texto pro número conectado. Deve cair em
`apps/web/app/api/whatsapp/webhook-evolution`, ser enfileirada e processada
pelo worker exatamente como no canal oficial.

## Voltar para o canal oficial

Basta trocar `WHATSAPP_CHANNEL_PROVIDER` de volta para `cloud-api` nas env vars
do ZapBuddy — não precisa desligar a instância Evolution (ela só fica sem uso).
