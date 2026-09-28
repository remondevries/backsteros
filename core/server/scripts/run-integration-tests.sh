#!/usr/bin/env bash
# Spin up local Docker Postgres, ensure an isolated test database exists,
# migrate it, and run server integration tests.
# Usage (from repo root or core/server):
#   pnpm --filter @backsteros/server test:integration
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

ensure_test_database() {
  local db_name="$1"
  echo "[integration] ensuring database '${db_name}' exists…"
  local exists
  exists="$(
    docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
      psql -U backsteros -d postgres -Atc \
      "SELECT 1 FROM pg_database WHERE datname = '${db_name}'"
  )"
  if [[ "$exists" != "1" ]]; then
    docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
      psql -U backsteros -d postgres -v ON_ERROR_STOP=1 -c \
      "CREATE DATABASE ${db_name}"
  fi
}

use_existing="${INTEGRATION_USE_EXISTING_DB:-0}"

if [[ "$use_existing" != "1" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "missing $ENV_FILE" >&2
    exit 1
  fi

  # Prefer an explicit override, otherwise the committed integration.env.
  if [[ -n "${DATABASE_URL:-}" ]]; then
    RESOLVED_DATABASE_URL="$DATABASE_URL"
    RESOLVED_SOURCE="DATABASE_URL override"
  else
    # Read only DATABASE_URL from the env file without executing the rest as shell.
    RESOLVED_DATABASE_URL="$(
      node -e '
        const fs = require("node:fs");
        const text = fs.readFileSync(process.argv[1], "utf8");
        for (const rawLine of text.split("\n")) {
          const line = rawLine.trim();
          if (!line || line.startsWith("#")) continue;
          const eq = line.indexOf("=");
          if (eq <= 0) continue;
          const key = line.slice(0, eq).trim();
          if (key !== "DATABASE_URL") continue;
          let value = line.slice(eq + 1).trim();
          if (
            (value.startsWith("\"") && value.endsWith("\"")) ||
            (value.startsWith("'\''") && value.endsWith("'\''"))
          ) {
            value = value.slice(1, -1);
          }
          process.stdout.write(value);
          break;
        }
      ' "$ENV_FILE"
    )"
    RESOLVED_SOURCE="$ENV_FILE"
  fi

  if [[ -z "${RESOLVED_DATABASE_URL:-}" ]]; then
    echo "[integration] missing DATABASE_URL (set it or add it to $ENV_FILE)" >&2
    exit 1
  fi

  assert_not_live_db "$RESOLVED_DATABASE_URL" "$RESOLVED_SOURCE"

  echo "[integration] starting Docker Postgres…"
  docker compose -f "$ROOT_DIR/docker-compose.yml" up -d postgres

  echo "[integration] waiting for Postgres health…"
  ready=0
  for _ in $(seq 1 60); do
    if docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
      pg_isready -U backsteros -d postgres >/dev/null 2>&1; then
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

  DB_NAME="$(database_name_from_url "$RESOLVED_DATABASE_URL")"
  ensure_test_database "$DB_NAME"

  echo "[integration] migrating…"
  (
    cd "$SERVER_DIR"
    DATABASE_URL="$RESOLVED_DATABASE_URL" pnpm exec tsx --env-file="$ENV_FILE" src/db/migrate.ts
  )

  echo "[integration] running tests…"
  (
    cd "$SERVER_DIR"
    DATABASE_URL="$RESOLVED_DATABASE_URL" pnpm exec tsx --env-file="$ENV_FILE" --test "src/integration/**/*.test.ts"
  )
  exit 0
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[integration] INTEGRATION_USE_EXISTING_DB=1 requires DATABASE_URL" >&2
  exit 1
fi

assert_not_live_db "$DATABASE_URL" "DATABASE_URL (INTEGRATION_USE_EXISTING_DB=1)"

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
