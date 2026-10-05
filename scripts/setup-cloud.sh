#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

node_major=""
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
fi

if [[ "$node_major" != "22" ]]; then
  if command -v mise >/dev/null 2>&1; then
    echo "Node.js 22 is required; restarting setup with mise."
    exec mise x node@22 -- npm run setup:cloud
  fi

  echo "Node.js 22 is required. Install/activate Node.js 22 or provide mise." >&2
  exit 1
fi

echo "Using $(node --version)."
npm ci

if [[ ! -f .env.local ]]; then
  if [[ ! -f .env.example ]]; then
    echo ".env.example is missing; cannot initialize .env.local." >&2
    exit 1
  fi
  cp .env.example .env.local
  echo "Created .env.local from .env.example."
else
  echo "Keeping existing .env.local."
fi

echo "Cloud setup complete."
