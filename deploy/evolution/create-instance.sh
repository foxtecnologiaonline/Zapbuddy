#!/usr/bin/env bash
# Cria a instância Evolution do ZapBuddy e já registra o webhook apontando
# para apps/web/app/api/whatsapp/webhook-evolution. Rode depois do setup.sh,
# de dentro deste diretório (lê o .env local pra AUTHENTICATION_API_KEY/DOMAIN).
#
# Uso: ./create-instance.sh <nome-da-instancia> <webhook-url-base> <evolution-webhook-secret>
# Ex.: ./create-instance.sh zapbuddy https://zapbuddy.vercel.app minhaChaveLonga123
set -euo pipefail

if [ ! -f .env ]; then
  echo "Erro: .env não encontrado. Rode: cp .env.example .env && nano .env" >&2
  exit 1
fi
# shellcheck disable=SC1091
source .env

INSTANCE_NAME="${1:?Uso: ./create-instance.sh <nome-da-instancia> <webhook-url-base> <secret>}"
WEBHOOK_BASE="${2:?Falta a URL base do webhook (ex.: https://zapbuddy.vercel.app)}"
WEBHOOK_SECRET="${3:?Falta o secret do webhook (mesmo valor de EVOLUTION_WEBHOOK_SECRET no ZapBuddy)}"

WEBHOOK_URL="${WEBHOOK_BASE}/api/whatsapp/webhook-evolution?secret=${WEBHOOK_SECRET}"

echo "==> Criando instância '${INSTANCE_NAME}' em https://${DOMAIN}"
curl -sS -X POST "https://${DOMAIN}/instance/create" \
  -H "apikey: ${AUTHENTICATION_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"instanceName\": \"${INSTANCE_NAME}\",
    \"qrcode\": true,
    \"integration\": \"WHATSAPP-BAILEYS\",
    \"rejectCall\": false,
    \"groupsIgnore\": true,
    \"alwaysOnline\": false,
    \"readMessages\": false,
    \"readStatus\": false,
    \"syncFullHistory\": false,
    \"webhook\": {
      \"url\": \"${WEBHOOK_URL}\",
      \"byEvents\": false,
      \"base64\": false,
      \"events\": [\"MESSAGES_UPSERT\"]
    }
  }" | tee /tmp/evolution-create-instance.json

echo
echo "==> Pegando o QR Code para pareamento (escaneie com o WhatsApp do número)"
curl -sS "https://${DOMAIN}/instance/connect/${INSTANCE_NAME}" \
  -H "apikey: ${AUTHENTICATION_API_KEY}"
echo
echo "No ZapBuddy (.env do Vercel/worker), configure:"
echo "  WHATSAPP_CHANNEL_PROVIDER=evolution"
echo "  EVOLUTION_API_URL=https://${DOMAIN}"
echo "  EVOLUTION_API_KEY=${AUTHENTICATION_API_KEY}"
echo "  EVOLUTION_INSTANCE_NAME=${INSTANCE_NAME}"
echo "  EVOLUTION_WEBHOOK_SECRET=${WEBHOOK_SECRET}"
