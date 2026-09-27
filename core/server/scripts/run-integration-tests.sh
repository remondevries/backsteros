#!/usr/bin/env bash
# Spin up local Docker Postgres, migrate, run server integration tests.
# Usage (from repo root or core/server):
#   pnpm --filter @backsteros/server test:integration
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$SERVER_DIR/../.." && pwd)"
ENV_FILE="$SERVER_DIR/integration.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi

echo "[integration] starting Docker Postgres…"
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d postgres

echo "[integration] waiting for Postgres health…"
for _ in $(seq 1 60); do
  if docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
    pg_isready -U backsteros -d backsteros >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
  pg_isready -U backsteros -d backsteros >/dev/null

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
