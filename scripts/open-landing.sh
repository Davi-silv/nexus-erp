#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://127.0.0.1:3000"
PORT=3000

is_up() {
  curl -sf "$URL" >/dev/null 2>&1
}

if ! is_up; then
  echo "Iniciando landing em $URL ..."
  npx --yes serve "$ROOT/marketing" -l "tcp://127.0.0.1:$PORT" >/dev/null 2>&1 &
  for _ in $(seq 1 30); do
    is_up && break
    sleep 0.3
  done
fi

if ! is_up; then
  echo "Erro: não foi possível iniciar o servidor da landing na porta $PORT."
  exit 1
fi

bash "$ROOT/scripts/open-browser.sh" "$URL"
