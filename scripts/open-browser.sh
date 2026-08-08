#!/usr/bin/env bash
# Abre URL no navegador externo (Chrome, Firefox ou xdg-open).
URL="${1:-http://127.0.0.1:8080}"

open_url() {
  if command -v google-chrome-stable >/dev/null 2>&1; then
    google-chrome-stable --new-window "$URL" >/dev/null 2>&1 &
    return 0
  fi
  if command -v google-chrome >/dev/null 2>&1; then
    google-chrome --new-window "$URL" >/dev/null 2>&1 &
    return 0
  fi
  if command -v chromium-browser >/dev/null 2>&1; then
    chromium-browser --new-window "$URL" >/dev/null 2>&1 &
    return 0
  fi
  if command -v firefox >/dev/null 2>&1; then
    firefox --new-window "$URL" >/dev/null 2>&1 &
    return 0
  fi
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
    return 0
  fi
  return 1
}

if open_url; then
  echo "Abrindo no navegador externo: $URL"
else
  echo "Nenhum navegador encontrado. Abra manualmente: $URL"
  exit 1
fi
