#!/bin/bash
# Spacebound – Pterodactyl startup script.
# Pterodactyl exposes the egg variables (SERVER_PORT, AUTO_UPDATE, BRANCH, ...) as environment variables.
set -uo pipefail
cd /home/container 2>/dev/null || cd "$(dirname "$0")/.."

if [ "${AUTO_UPDATE:-0}" = "1" ] && [ -d .git ]; then
  echo ">> Auto-update enabled – pulling latest ${BRANCH:-main}"
  URL="$(git remote get-url origin)"
  if [ -n "${USERNAME:-}" ] && [ -n "${ACCESS_TOKEN:-}" ]; then
    URL="https://${USERNAME}:${ACCESS_TOKEN}@${URL#https://}"
  fi
  BEFORE="$(git rev-parse HEAD)"
  if git fetch --depth 1 "$URL" "${BRANCH:-main}" && git reset --hard FETCH_HEAD; then
    if [ "$BEFORE" != "$(git rev-parse HEAD)" ] || [ ! -f server/dist/server.js ]; then
      echo ">> New version found – installing and building"
      npm ci --no-audit --no-fund && npm run build || echo "!! Update build failed – starting previous build"
    else
      echo ">> Already up to date"
    fi
  else
    echo "!! Update failed – starting current version"
  fi
fi

if [ ! -f server/dist/server.js ]; then
  echo ">> No build found – building"
  npm run build || { echo "!! Build failed. Reinstall the server from the panel."; exit 1; }
fi

export PORT="${SERVER_PORT:-${PORT:-3000}}"
export HOST="0.0.0.0"
exec node server/dist/server.js
