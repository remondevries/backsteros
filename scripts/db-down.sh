#!/usr/bin/env bash
# Tear down the live BacksterOS compose stack (project name `backsteros`).
# Refuses to run from a git worktree so a worktree `pnpm db:down` cannot stop
# the main checkout's containers/volumes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .git ]]; then
  echo "db:down refused: not the main checkout (.git is missing or a worktree link)." >&2
  echo "From a worktree, omit BACKSTEROS_COMPOSE_PROJECT=backsteros or use docker compose against the worktree project." >&2
  exit 1
fi

export BACKSTEROS_COMPOSE_PROJECT=backsteros
export COMPOSE_PROJECT_NAME=backsteros
exec docker compose down "$@"
