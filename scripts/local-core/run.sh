#!/usr/bin/env bash
# Foreground supervisor for local-core (Docker compose + API on :8788).
# Intended for LaunchAgent KeepAlive: exits non-zero if API dies so launchd restarts.
set -euo pipefail

LABEL="com.backsteros.local-core"
API_PORT=8788
LOG_DIR="${HOME}/.config/backsteros/desktop"
LOG_FILE="${LOG_DIR}/local-core.log"
LOG_PREV="${LOG_DIR}/local-core.log.prev"
# Match Hub: rotate when past ~32 MiB.
LOG_ROTATE_BYTES=$((32 * 1024 * 1024))
REPO_ROOT="${BACKSTEROS_REPO_ROOT:-}"
PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${PATH}"
export PATH

mkdir -p "${LOG_DIR}"

log() {
  local line
  line="$(date '+%Y-%m-%dT%H:%M:%S') [${LABEL}] $*"
  printf '%s\n' "${line}" >>"${LOG_FILE}"
  printf '%s\n' "${line}" >&2
}

rotate_log_if_needed() {
  if [[ -f "${LOG_FILE}" ]]; then
    local size
    size="$(wc -c <"${LOG_FILE}" | tr -d ' ')"
    if [[ "${size}" -ge "${LOG_ROTATE_BYTES}" ]]; then
      rm -f "${LOG_PREV}"
      mv "${LOG_FILE}" "${LOG_PREV}"
      : >"${LOG_FILE}"
      log "rotated local-core.log (${size} bytes → .prev)"
    fi
  else
    : >"${LOG_FILE}"
  fi
}

resolve_repo_root() {
  if [[ -n "${REPO_ROOT}" && -f "${REPO_ROOT}/pnpm-workspace.yaml" && -f "${REPO_ROOT}/docker-compose.yml" ]]; then
    return 0
  fi
  if [[ -f "${HOME}/.config/backsteros/hub.json" ]]; then
    REPO_ROOT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("repo_root") or "")' "${HOME}/.config/backsteros/hub.json" 2>/dev/null || true)"
    if [[ -n "${REPO_ROOT}" && -f "${REPO_ROOT}/pnpm-workspace.yaml" && -f "${REPO_ROOT}/docker-compose.yml" ]]; then
      return 0
    fi
  fi
  REPO_ROOT="${HOME}/BacksterOS/Projects/OS/Codebase"
  if [[ -f "${REPO_ROOT}/pnpm-workspace.yaml" && -f "${REPO_ROOT}/docker-compose.yml" ]]; then
    return 0
  fi
  return 1
}

api_healthy() {
  curl -fsS -m 2 "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1
}

wait_for_docker() {
  local started
  started="$(date +%s)"
  if docker info >/dev/null 2>&1; then
    return 0
  fi
  log "docker daemon down; opening Docker.app"
  open -a Docker >/dev/null 2>&1 || true
  while ! docker info >/dev/null 2>&1; do
    if (( $(date +%s) - started > 120 )); then
      log "Docker daemon did not become ready within 120s"
      return 1
    fi
    sleep 2
  done
}

ensure_compose() {
  log "docker compose up -d postgres mongo powersync (cwd=${REPO_ROOT})"
  if ! (
    cd "${REPO_ROOT}"
    docker compose up -d postgres mongo powersync
  ); then
    log "compose up reported an error; starting existing containers and repairing powersync mounts"
    docker start backsteros-postgres backsteros-powersync-mongo >/dev/null 2>&1 || true
    # Legacy mongo may live on an old compose network — alias it for postgres DNS.
    docker network connect --alias mongo backsteros_default backsteros-powersync-mongo >/dev/null 2>&1 || true
    docker network connect --alias mongo codebase_default backsteros-powersync-mongo >/dev/null 2>&1 || true
    docker network connect --alias postgres backsteros_default backsteros-postgres >/dev/null 2>&1 || true
    docker network connect --alias postgres codebase_default backsteros-postgres >/dev/null 2>&1 || true
    repair_powersync_if_needed
  fi
  # Quietly ensure powersync bind mounts point at this checkout (repo moves break them).
  ensure_compose_dns_aliases
  repair_powersync_if_needed
}

ensure_compose_dns_aliases() {
  # Repo moves can leave containers on different compose networks; PowerSync
  # needs service aliases `postgres` and `mongo` on its network.
  docker network connect --alias postgres backsteros_default backsteros-postgres >/dev/null 2>&1 || true
  docker network connect --alias postgres codebase_default backsteros-postgres >/dev/null 2>&1 || true
  docker network connect --alias mongo backsteros_default backsteros-powersync-mongo >/dev/null 2>&1 || true
  docker network connect --alias mongo codebase_default backsteros-powersync-mongo >/dev/null 2>&1 || true
}

powersync_mounts_ok() {
  local mounts
  mounts="$(docker inspect backsteros-powersync --format '{{range .Mounts}}{{.Source}}{{"\n"}}{{end}}' 2>/dev/null || true)"
  [[ "${mounts}" == *"${REPO_ROOT}/deploy/powersync/sync-config.yaml"* ]] \
    && [[ "${mounts}" == *"${REPO_ROOT}/deploy/powersync/service.local.yaml"* ]]
}

repair_powersync_if_needed() {
  if docker inspect -f '{{.State.Running}}' backsteros-powersync 2>/dev/null | grep -q true \
    && powersync_mounts_ok; then
    return 0
  fi
  log "recreating backsteros-powersync with mounts from ${REPO_ROOT}"
  docker rm -f backsteros-powersync >/dev/null 2>&1 || true
  (
    cd "${REPO_ROOT}"
    docker compose up -d --no-deps powersync
  )
}

enable_tailscale_serve() {
  local bin=""
  for candidate in \
    /Applications/Tailscale.app/Contents/MacOS/Tailscale \
    /opt/homebrew/bin/tailscale \
    /usr/local/bin/tailscale; do
    if [[ -x "${candidate}" ]]; then
      bin="${candidate}"
      break
    fi
  done
  if [[ -z "${bin}" ]]; then
    log "tailscale not found — skipping serve for :${API_PORT}"
    return 0
  fi
  if "${bin}" serve --bg --tcp="${API_PORT}" "tcp://127.0.0.1:${API_PORT}" >/dev/null 2>&1; then
    log "tailscale serve --tcp=${API_PORT} enabled"
  else
    log "tailscale serve warning (non-fatal)"
  fi
}

rotate_log_if_needed

if ! resolve_repo_root; then
  log "could not resolve BacksterOS repo root"
  exit 1
fi
export BACKSTEROS_REPO_ROOT="${REPO_ROOT}"

# OS-49: peer sync-event replay stamps updatedAt=now and can overwrite cloud.
# Table LWW still runs; re-enable after OS-49 is fixed.
export CORE_REPLICATION_SYNC_EVENTS_PULL="${CORE_REPLICATION_SYNC_EVENTS_PULL:-0}"

if api_healthy; then
  log "local-core already healthy on :${API_PORT}; supervising existing listener"
  enable_tailscale_serve
  # KeepAlive needs a long-lived process. Probe until /health fails, then exit
  # so launchd restarts and can respawn the API.
  while api_healthy; do
    rotate_log_if_needed
    sleep 15
  done
  log "local-core health lost; exiting for KeepAlive restart"
  exit 1
fi

wait_for_docker
ensure_compose
enable_tailscale_serve

if ! command -v pnpm >/dev/null 2>&1; then
  log "pnpm not found on PATH"
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  log "node not found on PATH"
  exit 1
fi

log "starting API: pnpm --filter @backsteros/server dev (CORE_REPLICATION_SYNC_EVENTS_PULL=${CORE_REPLICATION_SYNC_EVENTS_PULL})"
cd "${REPO_ROOT}"
# Rotate again just before redirect so a huge leftover log is not appended to.
rotate_log_if_needed
exec pnpm --filter @backsteros/server dev >>"${LOG_FILE}" 2>&1
