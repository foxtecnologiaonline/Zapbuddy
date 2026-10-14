#!/usr/bin/env bash
# Execute como root na MESMA VPS Vultr que já roda o ZapScript/Evolution
# API (evo.zapscript.me). Este script não altera nada do stack existente
# (containers próprios, nomes/rede próprios — ver README.md).
# Uso: baixe este arquivo sozinho e rode-o (ele clona o resto do repo):
#   curl -fsSL https://raw.githubusercontent.com/foxtecnologiaonline/Zapbuddy/<branch>/deploy/worker/setup.sh -o setup.sh
#   chmod +x setup.sh && ./setup.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/foxtecnologiaonline/Zapbuddy.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="/opt/zapbuddy"

echo "== PASSO 0: recursos atuais da VPS (confira antes de prosseguir) =="
free -h
echo ""
df -h /
echo ""
echo "Containers já rodando (não devem ser afetados por este script):"
docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null || echo "(docker ainda não instalado)"
echo ""

echo "== PASSO 1: Docker =="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
else
  echo "Docker já instalado, pulando."
fi

echo "== PASSO 2: clonar/atualizar o repositório =="
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR/deploy/worker"

echo "== PASSO 3: arquivo .env =="
if [ ! -f .env ]; then
  cp .env.example .env
  echo ">>> Criei deploy/worker/.env a partir do exemplo."
  echo ">>> PARE AQUI: edite $APP_DIR/deploy/worker/.env com os valores reais"
  echo ">>> (nano .env) e rode este script de novo pra continuar."
  exit 0
fi

if grep -qE '^(REDIS_URL|SUPABASE_URL|ANTHROPIC_API_KEY)=\s*$' .env; then
  echo ">>> deploy/worker/.env existe mas tem campos obrigatórios vazios."
  echo ">>> Edite (nano .env) e rode este script de novo."
  exit 1
fi

echo "== PASSO 4: build e start =="
docker compose up -d --build

echo "== PASSO 5: status =="
sleep 3
docker compose ps
echo ""
echo "Uso de recursos do container do ZapBuddy (compare com o PASSO 0):"
docker stats --no-stream zapbuddy-worker
echo ""
echo "Logs em tempo real:  cd $APP_DIR/deploy/worker && docker compose logs -f worker"
