#!/usr/bin/env bash
# Spin up local Docker Postgres, ensure an isolated test database exists,
# migrate it, and run server integration tests.
# Usage (from repo root or core/server):
#   pnpm --filter @backsteros/server test:integration
#
# Default: reuse an existing Postgres (integration.env DATABASE_URL) so worktrees
# do not run `docker compose up` against the shared `backsteros` project.
# Set INTEGRATION_USE_EXISTING_DB=0 to start compose (canonical build only).
#
# In GitHub Actions, set INTEGRATION_USE_EXISTING_DB=1 so the workflow
# service Postgres (DATABASE_URL) is reused instead of docker compose.
#
# Hard rule: never run against the live local-core database named `backsteros`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$SERVER_DIR/../.." && pwd)"
ENV_FILE="$SERVER_DIR/integration.env"
LIVE_DB_NAME="backsteros"
DEFAULT_TEST_DB_NAME="backsteros_test"
CANONICAL_COMPOSE_ROOT="${BACKSTEROS_LOCAL_CORE_BUILD:-${HOME}/.backsteros/local-core-build}"

database_name_from_url() {
  local url="$1"
  local path
  path="$(node -e '
    const raw = process.argv[1] ?? "";
    let pathname = "";
    try {
      pathname = new URL(raw).pathname ?? "";
    } catch {
      const match = raw.match(/\/([^\/\?\#]+)(?:[\?\#]|$)/);
      pathname = match ? `/${match[1]}` : "";
    }
    const name = pathname.replace(/^\/+/, "").split("/")[0] ?? "";
    process.stdout.write(name);
  ' "$url")"
  printf '%s' "$path"
}

assert_not_live_db() {
  local url="$1"
  local source="$2"
  local db_name
  db_name="$(database_name_from_url "$url")"
  echo "[integration] resolved database name: ${db_name:-<empty>} (from ${source})"
  if [[ -z "$db_name" ]]; then
    echo "[integration] refusing to run: could not parse database name from DATABASE_URL" >&2
    exit 1
  fi
  if [[ "$db_name" == "$LIVE_DB_NAME" ]]; then
    echo "[integration] refusing to run against live local-core database '${LIVE_DB_NAME}'." >&2
    echo "[integration] Use '${DEFAULT_TEST_DB_NAME}' (see core/server/integration.env) or another non-live name." >&2
    exit 1
  fi
}

read_database_url_from_env_file() {
  node -e "
    const fs = require('node:fs');
    const text = fs.readFileSync(process.argv[1], 'utf8');
    for (const rawLine of text.split('\\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (key !== 'DATABASE_URL') continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('\"') && value.endsWith('\"')) ||
        (value.startsWith(\"'\") && value.endsWith(\"'\"))
      ) {
        value = value.slice(1, -1);
      }
      process.stdout.write(value);
      break;
    }
  " "$ENV_FILE"
}

resolve_database_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    RESOLVED_DATABASE_URL="$DATABASE_URL"
    RESOLVED_SOURCE="DATABASE_URL override"
    return 0
  fi
  if [[ ! -f "$ENV_FILE" ]]; then
    return 1
  fi
  RESOLVED_DATABASE_URL="$(read_database_url_from_env_file)"
  RESOLVED_SOURCE="$ENV_FILE"
  [[ -n "${RESOLVED_DATABASE_URL:-}" ]]
}

ensure_test_database() {
  local db_name="$1"
  local compose_root="$2"
  echo "[integration] ensuring database '${db_name}' exists…"
  local exists
  exists="$(
    docker compose -f "$compose_root/docker-compose.yml" exec -T postgres \
      psql -U backsteros -d postgres -Atc \
      "SELECT 1 FROM pg_database WHERE datname = '${db_name}'"
  )"
  if [[ "$exists" != "1" ]]; then
    docker compose -f "$compose_root/docker-compose.yml" exec -T postgres \
      psql -U backsteros -d postgres -v ON_ERROR_STOP=1 -c \
      "CREATE DATABASE ${db_name}"
  fi
}

assert_compose_allowed() {
  if [[ "${INTEGRATION_ALLOW_COMPOSE:-0}" == "1" ]]; then
    return 0
  fi
  local canonical="$CANONICAL_COMPOSE_ROOT"
  if [[ -f "${canonical}/docker-compose.yml" && "${ROOT_DIR}" == "${canonical}" ]]; then
    return 0
  fi
  echo "[integration] refusing docker compose from ${ROOT_DIR}" >&2
  echo "[integration] Shared project name 'backsteros' would recreate live containers." >&2
  echo "[integration] Use INTEGRATION_USE_EXISTING_DB=1 (default) with Postgres on :5433," >&2
  echo "[integration] or run from ${canonical}, or set INTEGRATION_ALLOW_COMPOSE=1 to override." >&2
  exit 1
}

use_existing="${INTEGRATION_USE_EXISTING_DB:-1}"

if ! resolve_database_url; then
  if [[ "$use_existing" == "1" ]]; then
    echo "[integration] missing DATABASE_URL (set it or add it to $ENV_FILE)" >&2
    exit 1
  fi
fi

if [[ "$use_existing" != "1" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "missing $ENV_FILE" >&2
    exit 1
  fi
  if ! resolve_database_url; then
    echo "[integration] missing DATABASE_URL (set it or add it to $ENV_FILE)" >&2
    exit 1
  fi

  assert_not_live_db "$RESOLVED_DATABASE_URL" "$RESOLVED_SOURCE"
  assert_compose_allowed

  local_compose_root="$CANONICAL_COMPOSE_ROOT"
  if [[ ! -f "${local_compose_root}/docker-compose.yml" ]]; then
    local_compose_root="$ROOT_DIR"
  fi

  echo "[integration] starting Docker Postgres (compose root=${local_compose_root})…"
  export BACKSTEROS_COMPOSE_PROJECT="${BACKSTEROS_COMPOSE_PROJECT:-backsteros}"
  export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-${BACKSTEROS_COMPOSE_PROJECT}}"
  docker compose -f "$local_compose_root/docker-compose.yml" up -d postgres

  echo "[integration] waiting for Postgres health…"
  ready=0
  for _ in $(seq 1 60); do
    if docker compose -f "$local_compose_root/docker-compose.yml" exec -T postgres \
      pg_isready -U backsteros -d postgres >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "$ready" -ne 1 ]]; then
    echo "[integration] Postgres did not become ready" >&2
    docker compose -f "$local_compose_root/docker-compose.yml" ps >&2 || true
    docker compose -f "$local_compose_root/docker-compose.yml" logs --tail=80 postgres >&2 || true
    exit 1
  fi

  DB_NAME="$(database_name_from_url "$RESOLVED_DATABASE_URL")"
  ensure_test_database "$DB_NAME" "$local_compose_root"

  echo "[integration] migrating…"
  (
    cd "$SERVER_DIR"
    DATABASE_URL="$RESOLVED_DATABASE_URL" pnpm exec tsx --env-file="$ENV_FILE" src/db/migrate.ts
  )

  echo "[integration] running tests…"
  (
    cd "$SERVER_DIR"
    DATABASE_URL="$RESOLVED_DATABASE_URL" \
      BACKSTEROS_INTEGRATION_TEST=1 \
      CORE_REPLICATION_RECONCILE=0 \
      pnpm exec tsx --env-file="$ENV_FILE" --test "src/integration/**/*.test.ts"
  )
  exit 0
fi

if ! resolve_database_url; then
  echo "[integration] INTEGRATION_USE_EXISTING_DB=1 requires DATABASE_URL" >&2
  exit 1
fi

assert_not_live_db "$RESOLVED_DATABASE_URL" "DATABASE_URL (INTEGRATION_USE_EXISTING_DB=1)"

echo "[integration] using existing DATABASE_URL (skip docker compose)"
echo "[integration] migrating…"
(
  cd "$SERVER_DIR"
  DATABASE_URL="$RESOLVED_DATABASE_URL" pnpm exec tsx --env-file="$ENV_FILE" src/db/migrate.ts
)

echo "[integration] running tests…"
(
  cd "$SERVER_DIR"
  DATABASE_URL="$RESOLVED_DATABASE_URL" \
    BACKSTEROS_INTEGRATION_TEST=1 \
    CORE_REPLICATION_RECONCILE=0 \
    pnpm exec tsx --env-file="$ENV_FILE" --test "src/integration/**/*.test.ts"
)
