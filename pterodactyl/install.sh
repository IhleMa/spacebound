#!/bin/bash
# Spacebound - Pterodactyl installation script.
# Runs inside the install container (node:22-bookworm-slim) with the server's files mounted at /mnt/server.
# Re-running it ("Reinstall Server") updates the code but keeps the database in server/data/.
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/mnt/server}"
GIT_ADDRESS="${GIT_ADDRESS:-https://github.com/IhleMa/spacebound.git}"
BRANCH="${BRANCH:-main}"

need=()
command -v git >/dev/null || need+=(git)
command -v make >/dev/null || need+=(make)
command -v g++ >/dev/null || need+=(g++)
command -v python3 >/dev/null || need+=(python3)
if [ ${#need[@]} -gt 0 ]; then
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates "${need[@]}"
fi

[[ "$GIT_ADDRESS" == *.git ]] || GIT_ADDRESS="${GIT_ADDRESS}.git"
REPO_URL="$GIT_ADDRESS"
if [ -n "${USERNAME:-}" ] && [ -n "${ACCESS_TOKEN:-}" ]; then
  REPO_URL="https://${USERNAME}:${ACCESS_TOKEN}@${GIT_ADDRESS#https://}"
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

if [ -d .git ]; then
  echo ">> Existing installation found - updating to latest ${BRANCH}"
  git fetch --depth 1 "$REPO_URL" "$BRANCH"
  git reset --hard FETCH_HEAD
elif [ -z "$(ls -A . 2>/dev/null)" ]; then
  echo ">> Cloning ${GIT_ADDRESS} (${BRANCH})"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" .
else
  echo ">> Directory not empty - cloning into a temp folder and copying over (existing files are kept)"
  rm -rf /tmp/spacebound-src
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" /tmp/spacebound-src
  cp -a /tmp/spacebound-src/. .
  rm -rf /tmp/spacebound-src
fi
# Never leave credentials in the git config.
git remote set-url origin "$GIT_ADDRESS" 2>/dev/null || git remote add origin "$GIT_ADDRESS"
git config --global --add safe.directory "$INSTALL_DIR" || true

echo ">> Installing dependencies"
npm ci --no-audit --no-fund

echo ">> Building client and server"
npm run build

mkdir -p server/data
echo ">> Spacebound installed successfully"
