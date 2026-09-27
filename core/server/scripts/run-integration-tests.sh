#!/usr/bin/env bash
# Spin up local Docker Postgres, migrate, run server integration tests.
# Usage (from repo root or core/server):
#   pnpm --filter @backsteros/server test:integration
#
# In GitHub Actions, set INTEGRATION_USE_EXISTING_DB=1 so the workflow
# service Postgres (DATABASE_URL) is reused instead of docker compose.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$SERVER_DIR/../.." && pwd)"
ENV_FILE="$SERVER_DIR/integration.env"

use_existing="${INTEGRATION_USE_EXISTING_DB:-0}"

if [[ "$use_existing" != "1" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "missing $ENV_FILE" >&2
    exit 1
  fi

  echo "[integration] starting Docker Postgres…"
  docker compose -f "$ROOT_DIR/docker-compose.yml" up -d postgres

  echo "[integration] waiting for Postgres health…"
  ready=0
  for _ in $(seq 1 60); do
    if docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
      pg_isready -U backsteros -d backsteros >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "$ready" -ne 1 ]]; then
    echo "[integration] Postgres did not become ready" >&2
    docker compose -f "$ROOT_DIR/docker-compose.yml" ps >&2 || true
    docker compose -f "$ROOT_DIR/docker-compose.yml" logs --tail=80 postgres >&2 || true
    exit 1
  fi

  echo "[integration] migrating…"
  (
    cd "$SERVER_DIR"
    pnpm exec tsx --env-file="$ENV_FILE" src/db/migrate.ts
  )

  echo "[integration] running tests…"
  (
    cd "$SERVER_DIR"
    pnpm exec tsx --env-file="$ENV_FILE" --test "src/integration/**/*.test.ts"
  )
  exit 0
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[integration] INTEGRATION_USE_EXISTING_DB=1 requires DATABASE_URL" >&2
  exit 1
fi

echo "[integration] using existing DATABASE_URL (skip docker compose)"
echo "[integration] migrating…"
(
  cd "$SERVER_DIR"
  pnpm exec tsx src/db/migrate.ts
)

echo "[integration] running tests…"
(
  cd "$SERVER_DIR"
  pnpm exec tsx --test "src/integration/**/*.test.ts"
)
