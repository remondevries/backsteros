#!/usr/bin/env bash
# BacksterOS development server (OS-148) — core API + Vite web UI on Tailscale.
# Binds 127.0.0.1 / Tailscale 100.126.31.97 only. Never live cores or 0.0.0.0.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAILSCALE_IP="${DEV_SERVER_TAILSCALE_IP:-100.126.31.97}"
TMUX_SESSION="${DEV_SERVER_TMUX_SESSION:-backsteros-dev}"
COMPOSE_PROJECT="${BACKSTEROS_COMPOSE_PROJECT:-backsteros-devserver}"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.dev-server.yml)
ENV_ROOT="${ROOT}/.env.development"
ENV_SERVER="${ROOT}/core/server/.env"
ENV_WEB="${ROOT}/backsteros/.env"
VAULT_PATH="${BACKSTEROS_VAULT_PATH:-/home/deploy/.backsteros/dev-server-vault}"
LOG_DIR="${ROOT}/.dev-server-logs"
EXAMPLE="${ROOT}/deploy/dev-server.env.example"

export BACKSTEROS_COMPOSE_PROJECT="${COMPOSE_PROJECT}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT}"

die() { echo "dev-server: $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

assert_bind_safety() {
  # Refuse accidental public / all-interfaces binds in generated env files.
  local file="$1"
  [[ -f "$file" ]] || return 0
  if grep -Eiq '^(HOST|TAURI_DEV_HOST)=0\.0\.0\.0$' "$file"; then
    die "$file sets HOST/TAURI_DEV_HOST to 0.0.0.0 (forbidden)"
  fi
  if grep -Eiq '^(HOST|TAURI_DEV_HOST)=2\.31\.59\.251$' "$file"; then
    die "$file sets HOST to the public IP (forbidden)"
  fi
  if grep -Eiq 'agent\.backsteros\.com|188\.34\.196\.92|100\.83\.125\.67|46\.225\.171\.3' "$file"; then
    die "$file references a live core / production host (forbidden)"
  fi
}

write_env_files() {
  [[ -f "$EXAMPLE" ]] || die "missing $EXAMPLE"
  mkdir -p "$(dirname "$VAULT_PATH")" "$LOG_DIR"

  # Root env for compose variable substitution.
  if [[ ! -f "$ENV_ROOT" ]]; then
    grep -E '^(BACKSTEROS_COMPOSE_PROJECT|COMPOSE_PROJECT_NAME|POSTGRES_|DEV_SERVER_)' \
      "$EXAMPLE" >"$ENV_ROOT" || true
    # Ensure compose can read POSTGRES_* from project dir.
    {
      echo "BACKSTEROS_COMPOSE_PROJECT=${COMPOSE_PROJECT}"
      echo "COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT}"
      echo "POSTGRES_USER=backsteros"
      echo "POSTGRES_PASSWORD=backsteros_dev_only"
      echo "POSTGRES_DB=backsteros"
    } >"$ENV_ROOT"
    echo "Wrote $ENV_ROOT"
  fi

  if [[ ! -f "$ENV_SERVER" ]]; then
    cat >"$ENV_SERVER" <<EOF
DATABASE_URL=postgresql://backsteros:backsteros_dev_only@127.0.0.1:5433/backsteros
PORT=8788
HOST=${TAILSCALE_IP}
NODE_ENV=development
LOG_LEVEL=info
PUBLIC_API_URL=http://${TAILSCALE_IP}:8788
CORS_ORIGINS=http://${TAILSCALE_IP}:1420,http://development:1420,http://127.0.0.1:1420,http://localhost:1420,tauri://localhost,https://tauri.localhost
LOCAL_SHELL_AUTH=1
LOCAL_SHELL_TOKEN=local
POWERSYNC_JWT_SECRET=PhusPC__XjONaDuOHFIEcJF8bKH-PnyblObbfJO7yz8
POWERSYNC_AUDIENCE=backsteros-powersync
POWERSYNC_URL=http://${TAILSCALE_IP}:8080
POWERSYNC_LOCAL_URL=http://127.0.0.1:8080
BACKSTEROS_VAULT_PATH=${VAULT_PATH}
EOF
    echo "Wrote $ENV_SERVER"
  fi

  if [[ ! -f "$ENV_WEB" ]]; then
    cat >"$ENV_WEB" <<EOF
VITE_API_URL=http://${TAILSCALE_IP}:8788
VITE_TREAT_API_AS_LOCAL_CORE=1
VITE_LOCAL_SHELL_TOKEN=local
TAURI_DEV_HOST=${TAILSCALE_IP}
EOF
    echo "Wrote $ENV_WEB"
  fi

  assert_bind_safety "$ENV_ROOT"
  assert_bind_safety "$ENV_SERVER"
  assert_bind_safety "$ENV_WEB"
  mkdir -p "$VAULT_PATH"
}

compose() {
  # Load POSTGRES_* for compose interpolation.
  set -a
  # shellcheck disable=SC1090
  [[ -f "$ENV_ROOT" ]] && source "$ENV_ROOT"
  set +a
  docker compose --env-file "$ENV_ROOT" "${COMPOSE_FILES[@]}" "$@"
}

wait_postgres() {
  local i
  for i in $(seq 1 60); do
    if compose exec -T postgres pg_isready -U backsteros -d backsteros >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  die "postgres did not become ready"
}

wait_http() {
  local url="$1"
  local i
  for i in $(seq 1 90); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  die "timed out waiting for $url"
}

ensure_deps() {
  # Prefer filtered install to avoid mobile / nested apps on a 3.7 GB box.
  # Re-run when the server package cannot resolve its own entry (partial installs).
  local need_install=0
  if [[ ! -f "$ROOT/core/server/package.json" ]]; then
    die "missing core/server/package.json"
  fi
  if [[ ! -d "$ROOT/node_modules/.pnpm" ]]; then
    need_install=1
  elif ! pnpm --filter @backsteros/server exec node -e "require('postgres')" >/dev/null 2>&1; then
    need_install=1
  elif [[ ! -d "$ROOT/backsteros/node_modules/vite" ]] && [[ ! -e "$ROOT/node_modules/vite" ]]; then
    # vite may be hoisted or in the package store; also check pnpm why path.
    if ! pnpm --filter @backsteros/desktop exec node -e "require('vite/package.json')" >/dev/null 2>&1; then
      need_install=1
    fi
  fi
  if [[ "$need_install" -eq 1 ]]; then
    echo "Installing workspace deps for core + web only (this can take a few minutes)…"
    pnpm install \
      --filter @backsteros/server... \
      --filter @backsteros/desktop... \
      --filter @backsteros/cli... \
      --filter @backsteros/ui...
  else
    echo "Workspace deps for core + web already present."
  fi
}

build_web_deps() {
  # Vite resolves package exports from dist/ (Linux is case-sensitive for app.css).
  pnpm --filter @backsteros/contracts build
  pnpm --filter @backsteros/api-client build
  pnpm --filter @backsteros/powersync-schema build
  pnpm --filter @backsteros/ui build
}

migrate_and_seed() {
  build_web_deps
  pnpm --filter @backsteros/server db:migrate
  # Role password comes from init-local.sql (`powersync`); leave POWERSYNC_DB_PASSWORD unset.
  pnpm --filter @backsteros/server db:powersync-setup
  pnpm --filter @backsteros/server db:seed
  pnpm --filter @backsteros/server db:seed-demo
}

tmux_running() {
  tmux has-session -t "$TMUX_SESSION" 2>/dev/null
}

start_tmux_apps() {
  need_cmd tmux
  if tmux_running; then
    echo "tmux session '$TMUX_SESSION' already running"
    return 0
  fi

  mkdir -p "$LOG_DIR"
  tmux new-session -d -s "$TMUX_SESSION" -n core \
    "cd '$ROOT' && pnpm --filter @backsteros/server dev 2>&1 | tee -a '$LOG_DIR/core.log'"
  tmux new-window -t "$TMUX_SESSION" -n web \
    "cd '$ROOT/backsteros' && export TAURI_DEV_HOST='${TAILSCALE_IP}' && pnpm run dev:browser 2>&1 | tee -a '$LOG_DIR/web.log'"
  echo "Started tmux session '$TMUX_SESSION' (windows: core, web)"
}

stop_tmux_apps() {
  if tmux_running; then
    tmux kill-session -t "$TMUX_SESSION"
    echo "Stopped tmux session '$TMUX_SESSION'"
  else
    echo "No tmux session '$TMUX_SESSION'"
  fi
}

cmd_up() {
  need_cmd docker
  need_cmd pnpm
  need_cmd curl
  need_cmd tmux
  write_env_files
  ensure_deps
  echo "Starting Docker (project ${COMPOSE_PROJECT})…"
  compose up -d
  wait_postgres
  migrate_and_seed
  start_tmux_apps
  echo "Waiting for API health…"
  wait_http "http://${TAILSCALE_IP}:8788/health"
  echo "Waiting for Vite…"
  wait_http "http://${TAILSCALE_IP}:1420/" || true
  cat <<EOF

BacksterOS dev-server is up.

  Web UI:     http://${TAILSCALE_IP}:1420/   (or http://development:1420/)
  API:        http://${TAILSCALE_IP}:8788/health
  PowerSync:  http://${TAILSCALE_IP}:8080/
  OpenAPI:    http://${TAILSCALE_IP}:8788/api/v1/openapi.json

  Login: no password — local-shell bearer \`local\` (automatic in the web app).
  Logs:  tmux attach -t ${TMUX_SESSION}   or   ${LOG_DIR}/
  Stop:  scripts/dev-server.sh down
  Reset: scripts/dev-server.sh reset

EOF
}

cmd_down() {
  stop_tmux_apps
  if [[ -f "$ENV_ROOT" ]]; then
    compose down
  else
    BACKSTEROS_COMPOSE_PROJECT="$COMPOSE_PROJECT" COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT" \
      docker compose "${COMPOSE_FILES[@]}" down || true
  fi
  echo "Dev-server stopped (Docker volumes kept)."
}

cmd_reset() {
  stop_tmux_apps
  write_env_files
  echo "Destroying Docker volumes for ${COMPOSE_PROJECT}…"
  compose down -v
  echo "Recreating fresh DB + seed…"
  compose up -d
  wait_postgres
  ensure_deps
  migrate_and_seed
  start_tmux_apps
  wait_http "http://${TAILSCALE_IP}:8788/health"
  echo "Reset complete."
}

cmd_status() {
  echo "Compose project: ${COMPOSE_PROJECT}"
  compose ps || true
  echo
  if tmux_running; then
    echo "tmux: session '${TMUX_SESSION}' is running"
    tmux list-windows -t "$TMUX_SESSION" || true
  else
    echo "tmux: session '${TMUX_SESSION}' is not running"
  fi
  echo
  curl -fsS "http://${TAILSCALE_IP}:8788/health" && echo || echo "API: down"
  curl -fsS -o /dev/null -w "Vite: HTTP %{http_code}\n" "http://${TAILSCALE_IP}:1420/" || echo "Vite: down"
}

cmd_logs() {
  if tmux_running; then
    tmux attach -t "$TMUX_SESSION"
  else
    die "no tmux session '$TMUX_SESSION' — start with: scripts/dev-server.sh up"
  fi
}

usage() {
  cat <<EOF
Usage: scripts/dev-server.sh <up|down|reset|status|logs>

  up      Start Postgres/PowerSync, migrate, seed, run API + Vite in tmux
  down    Stop API/Vite tmux session and Docker containers (keep volumes)
  reset   down -v, then up with a fresh DB + demo seed
  status  Show compose/tmux/health
  logs    Attach to the tmux session

See docs/dev-server.md.
EOF
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    up) cmd_up ;;
    down) cmd_down ;;
    reset) cmd_reset ;;
    status) cmd_status ;;
    logs) cmd_logs ;;
    -h|--help|help|"") usage; [[ -n "$cmd" ]] || exit 1 ;;
    *) usage; die "unknown command: $cmd" ;;
  esac
}

main "${1:-}"
