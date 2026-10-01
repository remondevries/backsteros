#!/usr/bin/env bash
# Foreground supervisor for local-core (Docker compose + API on :8788).
# Intended for LaunchAgent KeepAlive: exits non-zero if API dies so launchd restarts.
# Listens on 127.0.0.1 only — does not enable Tailscale serve.
set -euo pipefail

LABEL="com.backsteros.local-core"
API_PORT=8788
LOG_DIR="${HOME}/.config/backsteros/desktop"
LOG_FILE="${LOG_DIR}/local-core.log"
LOG_PREV="${LOG_DIR}/local-core.log.prev"
# Match Hub: rotate when past ~32 MiB. Override with LOCAL_CORE_LOG_ROTATE_BYTES for tests.
LOG_ROTATE_BYTES="${LOCAL_CORE_LOG_ROTATE_BYTES:-$((32 * 1024 * 1024))}"
SUPERVISE_INTERVAL_SECS="${LOCAL_CORE_SUPERVISE_INTERVAL_SECS:-30}"
REPO_ROOT="${BACKSTEROS_REPO_ROOT:-}"
PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${PATH}"
export PATH

CHILD_PID=""
SHUTTING_DOWN=0

mkdir -p "${LOG_DIR}"

log() {
  local line
  line="$(date '+%Y-%m-%dT%H:%M:%S') [${LABEL}] $*"
  # Supervisor messages go to the service log (copy-truncate safe) and stderr
  # (captured by launchd into local-core.launchd.log).
  printf '%s\n' "${line}" >>"${LOG_FILE}" 2>/dev/null || true
  printf '%s\n' "${line}" >&2
}

# Copy-truncate so the child's O_APPEND fd keeps writing to the same inode path
# after we empty it in place (mv+create would leave the child on the old inode).
rotate_log_if_needed() {
  if [[ ! -f "${LOG_FILE}" ]]; then
    : >"${LOG_FILE}"
    return 0
  fi
  local size
  size="$(wc -c <"${LOG_FILE}" | tr -d ' ')"
  if [[ "${size}" -lt "${LOG_ROTATE_BYTES}" ]]; then
    return 0
  fi
  rm -f "${LOG_PREV}"
  cp "${LOG_FILE}" "${LOG_PREV}"
  : >"${LOG_FILE}"
  # Avoid recursive append failures if LOG_FILE briefly unavailable.
  printf '%s\n' "$(date '+%Y-%m-%dT%H:%M:%S') [${LABEL}] rotated local-core.log (${size} bytes → .prev, threshold=${LOG_ROTATE_BYTES})" >>"${LOG_FILE}" 2>/dev/null || true
  printf '%s\n' "$(date '+%Y-%m-%dT%H:%M:%S') [${LABEL}] rotated local-core.log (${size} bytes → .prev, threshold=${LOG_ROTATE_BYTES})" >&2
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
    docker network connect --alias mongo backsteros_default backsteros-powersync-mongo >/dev/null 2>&1 || true
    docker network connect --alias mongo codebase_default backsteros-powersync-mongo >/dev/null 2>&1 || true
    docker network connect --alias postgres backsteros_default backsteros-postgres >/dev/null 2>&1 || true
    docker network connect --alias postgres codebase_default backsteros-postgres >/dev/null 2>&1 || true
    repair_powersync_if_needed
  fi
  ensure_compose_dns_aliases
  repair_powersync_if_needed
}

ensure_compose_dns_aliases() {
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

child_alive() {
  [[ -n "${CHILD_PID}" ]] && kill -0 "${CHILD_PID}" 2>/dev/null
}

kill_tree() {
  local sig="$1"
  local root="$2"
  [[ -z "${root}" ]] && return 0
  # Prefer process-group signal (job-control / setpgid). Fall back to the pid
  # and its descendants (macOS has no setsid(1)).
  kill "-${sig}" -- "-${root}" 2>/dev/null || true
  kill "-${sig}" "${root}" 2>/dev/null || true
  local kids
  kids="$(pgrep -P "${root}" 2>/dev/null || true)"
  local kid
  for kid in ${kids}; do
    kill_tree "${sig}" "${kid}"
  done
}

stop_child() {
  SHUTTING_DOWN=1
  if ! child_alive; then
    CHILD_PID=""
    return 0
  fi
  log "forwarding shutdown to child tree ${CHILD_PID}"
  kill_tree TERM "${CHILD_PID}"
  local waited=0
  while child_alive && (( waited < 15 )); do
    sleep 1
    waited=$((waited + 1))
  done
  if child_alive; then
    log "child still alive after TERM; sending KILL"
    kill_tree KILL "${CHILD_PID}"
  fi
  wait "${CHILD_PID}" 2>/dev/null || true
  CHILD_PID=""
}

on_signal() {
  log "received signal; shutting down"
  stop_child
  exit 0
}

trap on_signal TERM INT HUP

start_api_child() {
  log "starting API: pnpm --filter @backsteros/server dev (CORE_REPLICATION_SYNC_EVENTS_PULL=${CORE_REPLICATION_SYNC_EVENTS_PULL})"
  cd "${REPO_ROOT}"
  rotate_log_if_needed
  # Job control puts the background pipeline in its own process group so
  # launchd stop can signal the whole pnpm/tsx tree (macOS has no setsid(1)).
  set -m
  pnpm --filter @backsteros/server dev >>"${LOG_FILE}" 2>&1 &
  CHILD_PID=$!
  set +m
  log "API child pid ${CHILD_PID}"
}

supervise_loop() {
  log "supervising (interval=${SUPERVISE_INTERVAL_SECS}s, rotate≥${LOG_ROTATE_BYTES} bytes)"
  while true; do
    if [[ "${SHUTTING_DOWN}" -eq 1 ]]; then
      exit 0
    fi
    if ! child_alive; then
      local status=0
      wait "${CHILD_PID}" 2>/dev/null || status=$?
      log "API child exited (pid=${CHILD_PID}, wait_status=${status}); exiting for KeepAlive restart"
      exit 1
    fi
    rotate_log_if_needed
    sleep "${SUPERVISE_INTERVAL_SECS}"
  done
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

if ! command -v pnpm >/dev/null 2>&1; then
  log "pnpm not found on PATH"
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  log "node not found on PATH"
  exit 1
fi

wait_for_docker
ensure_compose

if api_healthy; then
  # Another process (Hub) already owns :8788. Supervise health only — do not
  # start a second API. If health drops, exit so KeepAlive can take over.
  log "local-core already healthy on :${API_PORT}; monitoring existing listener (no Tailscale serve)"
  while api_healthy; do
    rotate_log_if_needed
    sleep "${SUPERVISE_INTERVAL_SECS}"
  done
  log "local-core health lost; exiting for KeepAlive restart"
  exit 1
fi

start_api_child

# Wait until healthy or child dies (predev can take a while).
ready=0
for _ in $(seq 1 90); do
  if api_healthy; then
    ready=1
    break
  fi
  if ! child_alive; then
    wait "${CHILD_PID}" 2>/dev/null || true
    log "API child exited before becoming healthy"
    exit 1
  fi
  sleep 1
done
if [[ "${ready}" -ne 1 ]]; then
  log "API did not become healthy within 90s; stopping child"
  stop_child
  exit 1
fi
log "API healthy on 127.0.0.1:${API_PORT}"

supervise_loop
