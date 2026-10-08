#!/usr/bin/env bash
# Bootstrap da stack Evolution API numa VPS Ubuntu: abre firewall do SO,
# instala Docker (se faltar), sobe a stack. Rode como root ou com sudo,
# de dentro deste diretório, depois de preencher o .env (cp .env.example .env).
set -euo pipefail

if [ ! -f .env ]; then
  echo "Erro: .env não encontrado. Rode: cp .env.example .env && nano .env" >&2
  exit 1
fi

echo "==> Abrindo portas 80/443 no firewall do SO (ufw, se presente)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Docker não encontrado — instalando"
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Subindo a stack (docker compose up -d)"
docker compose up -d

echo
echo "Acompanhe o SSL com: docker compose logs -f caddy"
echo "Quando aparecer 'certificate obtained', a instância está em https://\$DOMAIN"
