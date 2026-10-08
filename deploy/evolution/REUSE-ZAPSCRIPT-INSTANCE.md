# Reaproveitar a Evolution API já hospedada no Vultr do ZapScript

Alternativa a `docker-compose.yml`/`setup.sh` desta pasta (que sobem uma instância
nova do zero): usar a Evolution API que **já roda em produção** no servidor Vultr
do ZapScript (`infra/docker-compose.prod.yml` do repo zapscript), criando ali
dentro só uma instância nova dedicada ao ZapBuddy.

## Bloqueio atual — leia antes de tentar

O serviço `evolution` nesse `docker-compose.prod.yml` publica a porta assim:

```yaml
ports:
  - "127.0.0.1:8080:8080"   # só loopback
```

E o Nginx (`infra/nginx-zapscript.conf`) só tem `location /` e `location
/socket.io/`, ambos apontando pra porta 3001 (a API do ZapScript) — **nenhum
location proxia a porta 8080**. Ou seja: hoje só o `api`/`worker` do próprio
ZapScript conseguem falar com essa Evolution API (rede Docker interna,
`http://evolution:8080`). O ZapBuddy, rodando no Vercel, está fora dessa rede e
não alcança esse endereço — precisa de um endpoint público em HTTPS.

Isto precisa ser feito por quem tem SSH no servidor Vultr (meu ambiente não
alcança a porta 22 dele — mesma limitação já documentada no `CLAUDE.md` do
ZapScript).

## O que fazer na VPS (uma vez só)

### 1. Escolher um subdomínio dedicado (não reusar `api.zapscript.me`)

Isolar num subdomínio próprio evita expor a API completa da Evolution (que
inclui endpoints administrativos) no mesmo host/certificado da API principal
do ZapScript. Sugestão: `evo.zapscript.me` (mesmo nome já usado no experimento
`deploy/evolution-oci`, mas agora apontando pro Evolution real).

No DNS: registro A `evo` → mesmo IP público da VPS (216.238.120.65).

### 2. Novo bloco Nginx (não altera os blocos existentes)

Criar `/etc/nginx/sites-available/evo-zapscript`, ativar com
`ln -s ... /etc/nginx/sites-enabled/`:

```nginx
server {
    listen 80;
    server_name evo.zapscript.me;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    server_name evo.zapscript.me;

    ssl_certificate     /etc/letsencrypt/live/evo.zapscript.me/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/evo.zapscript.me/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    client_max_body_size 50M;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

Gerar o certificado (portas 80/443 já estão liberadas no firewall dessa VPS,
porque `api.zapscript.me` já usa):

```bash
certbot certonly --nginx -d evo.zapscript.me
nginx -t && systemctl reload nginx
```

### 3. Pegar a `AUTHENTICATION_API_KEY` já existente

Está em `/opt/zapscript/.env`, variável `EVOLUTION_API_KEY`. **Não precisa
gerar uma nova** — é a mesma chave que a API do ZapScript já usa pra falar com
essa Evolution.

```bash
grep EVOLUTION_API_KEY /opt/zapscript/.env
```

### 4. Criar a instância do ZapBuddy nessa Evolution compartilhada

Da própria VPS (ou de qualquer máquina, já que a porta 8080 agora está
pública via HTTPS em `evo.zapscript.me`):

```bash
curl -X POST "https://evo.zapscript.me/instance/create" \
  -H "apikey: <EVOLUTION_API_KEY do passo 3>" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "zapbuddy",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS",
    "rejectCall": false,
    "groupsIgnore": true,
    "alwaysOnline": false,
    "readMessages": false,
    "readStatus": false,
    "syncFullHistory": false,
    "webhook": {
      "url": "https://zapbuddy.vercel.app/api/whatsapp/webhook-evolution?secret=<ESCOLHA_UM_SECRET_FORTE>",
      "byEvents": false,
      "base64": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'

curl "https://evo.zapscript.me/instance/connect/zapbuddy" \
  -H "apikey: <EVOLUTION_API_KEY do passo 3>"
# escaneie o QR Code impresso com o WhatsApp do número do ZapBuddy
# (precisa ser um número diferente de qualquer um já usado no ZapScript)
```

(O script `create-instance.sh` desta pasta faz os mesmos dois `curl` acima —
pode adaptá-lo em vez de copiar manualmente, só trocando `DOMAIN`/
`AUTHENTICATION_API_KEY` no `.env` dele pelos valores de cima.)

### 5. Configurar o ZapBuddy

No Vercel (projeto `zapbuddy`) e no host do worker:

```
WHATSAPP_CHANNEL_PROVIDER=evolution
EVOLUTION_API_URL=https://evo.zapscript.me
EVOLUTION_API_KEY=<a mesma do passo 3>
EVOLUTION_INSTANCE_NAME=zapbuddy
EVOLUTION_WEBHOOK_SECRET=<o mesmo secret do passo 4>
```

## Risco de misturar com o ZapScript

Essa Evolution API é **compartilhada** — mesmo banco/arquivo de instâncias que
o ZapScript usa para os números dos clientes dele. Criar/deletar/reiniciar a
instância `zapbuddy` não afeta as outras (`instanceName` isola cada número),
mas um incidente na Evolution (ex. reinício do container, estourar
`QRCODE_LIMIT`) afeta os dois produtos ao mesmo tempo. Se o volume do ZapBuddy
crescer, considere migrar pra uma instância só sua (`docker-compose.yml` desta
pasta, numa VPS própria) — a troca é só mudar as 4 env vars acima, nenhuma
mudança de código.
