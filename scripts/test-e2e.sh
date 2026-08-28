#!/usr/bin/env bash
# Playwright não distribui Chromium para Debian 11 — usa o Chrome do sistema.
# Instalação: não use `npx playwright install chromium` neste SO.
# Use: npm run test:e2e
set -euo pipefail

export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

CHROME="${PLAYWRIGHT_CHROME_PATH:-}"
if [ -z "$CHROME" ]; then
  for candidate in google-chrome-stable google-chrome chromium chromium-browser; do
    if command -v "$candidate" >/dev/null 2>&1; then
      CHROME="$(command -v "$candidate")"
      break
    fi
  done
fi

if [ -z "$CHROME" ] && [ -n "${CI:-}" ]; then
  echo "CI: usando Chromium bundled do Playwright"
  unset PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
  exec npx playwright test "$@"
fi

if [ -z "$CHROME" ]; then
  echo "Erro: nenhum navegador Chrome/Chromium encontrado no sistema."
  echo "Instale Google Chrome ou defina PLAYWRIGHT_CHROME_PATH=/caminho/do/chrome"
  exit 1
fi

export PLAYWRIGHT_CHROME_PATH="$CHROME"
echo "Usando navegador: $PLAYWRIGHT_CHROME_PATH"
exec npx playwright test "$@"
