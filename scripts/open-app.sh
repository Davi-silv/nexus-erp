#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://127.0.0.1:8080"

is_up() {
  curl -sf "$URL" >/dev/null 2>&1
}

if ! is_up; then
  echo "Iniciando app ERP em $URL ..."
  npm run dev --prefix "$ROOT" >/dev/null 2>&1 &
  for _ in $(seq 1 40); do
    is_up && break
    sleep 0.3
  done
fi

if ! is_up; then
  echo "Erro: app não respondeu em $URL."
  echo "Tente manualmente: npm run dev"
  exit 1
fi

bash "$ROOT/scripts/open-browser.sh" "$URL"
