#!/usr/bin/env bash
# Foreground supervisor for local-core (Docker compose + API on :8788).
# Intended for LaunchAgent KeepAlive: exits non-zero if API dies so launchd restarts.
# Listens on 127.0.0.1 only — does not enable Tailscale serve.
#
# Runs `tsx` without `watch` so a dead node process ends the child. Health is
# polled as a second signal: consecutive /health failures kill the tree and
# exit non-zero even if a parent wrapper somehow lingered.
set -euo pipefail

LABEL="com.backsteros.local-core"
API_PORT="${LOCAL_CORE_API_PORT:-8788}"
LOG_DIR="${HOME}/.config/backsteros/desktop"
LOG_FILE="${LOG_DIR}/local-core.log"
LOG_PREV="${LOG_DIR}/local-core.log.prev"
# One threshold for startup + supervise loop (~32 MiB). Override for tests.
LOG_ROTATE_BYTES="${LOCAL_CORE_LOG_ROTATE_BYTES:-$((32 * 1024 * 1024))}"
LOG_ROTATE_GENERATIONS="${LOCAL_CORE_LOG_ROTATE_GENERATIONS:-5}"
# Health poll interval / consecutive failures before restart (after startup grace).
HEALTH_INTERVAL_SECS="${LOCAL_CORE_HEALTH_INTERVAL_SECS:-10}"
HEALTH_FAIL_THRESHOLD="${LOCAL_CORE_HEALTH_FAIL_THRESHOLD:-3}"
STARTUP_GRACE_SECS="${LOCAL_CORE_STARTUP_GRACE_SECS:-90}"
REPO_ROOT="${BACKSTEROS_REPO_ROOT:-}"
# Dedicated origin/production worktree (OS-61). Prefer this over a dirty checkout.
LOCAL_CORE_BUILD="${BACKSTEROS_LOCAL_CORE_BUILD:-${HOME}/.backsteros/local-core-build}"
ENV_FILE="${LOCAL_CORE_ENV_FILE:-}"
PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${PATH}"
export PATH

CHILD_PID=""
CHILD_PGID=""
SHUTTING_DOWN=0
BECAME_HEALTHY_AT=""

mkdir -p "${LOG_DIR}"

log() {
  local line
  line="$(date '+%Y-%m-%dT%H:%M:%S') [${LABEL}] $*"
  printf '%s\n' "${line}" >>"${LOG_FILE}" 2>/dev/null || true
  printf '%s\n' "${line}" >&2
}

# sleep that returns immediately when a signal arrives (launchd SIGTERM).
interruptible_sleep() {
  local secs="${1:-1}"
  sleep "${secs}" &
  local spid=$!
  wait "${spid}" 2>/dev/null || true
}

# Copy-truncate so the child's O_APPEND fd keeps writing to the same inode.
# Keep LOG_ROTATE_GENERATIONS numbered slots (.1 newest … .N oldest). Never
# rotate a file smaller than LOG_ROTATE_BYTES (startup and loop share this).
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

  # Migrate legacy single-slot .prev into the numbered chain once.
  if [[ -f "${LOG_PREV}" && ! -f "${LOG_FILE}.1" ]]; then
    mv "${LOG_PREV}" "${LOG_FILE}.1" 2>/dev/null || true
  else
    rm -f "${LOG_PREV}" 2>/dev/null || true
  fi

  local i next
  local last="${LOG_ROTATE_GENERATIONS}"
  rm -f "${LOG_FILE}.${last}" 2>/dev/null || true
  for ((i = last - 1; i >= 1; i--)); do
    next=$((i + 1))
    if [[ -f "${LOG_FILE}.${i}" ]]; then
      mv "${LOG_FILE}.${i}" "${LOG_FILE}.${next}" 2>/dev/null || true
    fi
  done
  cp "${LOG_FILE}" "${LOG_FILE}.1"
  : >"${LOG_FILE}"
  local msg
  msg="$(date '+%Y-%m-%dT%H:%M:%S') [${LABEL}] rotated local-core.log (${size} bytes → .1….${last}, threshold=${LOG_ROTATE_BYTES})"
  printf '%s\n' "${msg}" >>"${LOG_FILE}" 2>/dev/null || true
  printf '%s\n' "${msg}" >&2
}


resolve_repo_root() {
  # Prefer the dedicated local-core build (origin/production worktree).
  if [[ -n "${LOCAL_CORE_BUILD}" \
    && -f "${LOCAL_CORE_BUILD}/pnpm-workspace.yaml" \
    && -f "${LOCAL_CORE_BUILD}/docker-compose.yml" \
    && -d "${LOCAL_CORE_BUILD}/core/server" ]]; then
    REPO_ROOT="${LOCAL_CORE_BUILD}"
    return 0
  fi
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

# Runtime secrets stay in the developer checkout (or LOCAL_CORE_ENV_FILE). The
# dedicated build worktree must not need its own copy of .env.
resolve_env_file() {
  if [[ -n "${ENV_FILE}" && -f "${ENV_FILE}" ]]; then
    return 0
  fi
  if [[ -f "${REPO_ROOT}/core/server/.env" ]]; then
    ENV_FILE="${REPO_ROOT}/core/server/.env"
    return 0
  fi
  local hub_root=""
  if [[ -f "${HOME}/.config/backsteros/hub.json" ]]; then
    hub_root="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("repo_root") or "")' "${HOME}/.config/backsteros/hub.json" 2>/dev/null || true)"
    if [[ -n "${hub_root}" && -f "${hub_root}/core/server/.env" ]]; then
      ENV_FILE="${hub_root}/core/server/.env"
      return 0
    fi
  fi
  local fallback="${HOME}/BacksterOS/Projects/OS/Codebase/core/server/.env"
  if [[ -f "${fallback}" ]]; then
    ENV_FILE="${fallback}"
    return 0
  fi
  return 1
}

export_build_version_env() {
  local info="${REPO_ROOT}/core/server/build-info.json"
  if [[ -f "${info}" ]]; then
    local commit built_at dirty
    commit="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("commit") or "")' "${info}" 2>/dev/null || true)"
    built_at="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("builtAt") or "")' "${info}" 2>/dev/null || true)"
    dirty="$(python3 -c 'import json,sys; print("1" if json.load(open(sys.argv[1])).get("dirty") else "0")' "${info}" 2>/dev/null || true)"
    if [[ -n "${commit}" && -n "${built_at}" ]]; then
      export BACKSTEROS_BUILD_COMMIT="${commit}"
      export BACKSTEROS_BUILD_BUILT_AT="${built_at}"
      export BACKSTEROS_BUILD_DIRTY="${dirty:-0}"
      return 0
    fi
  fi
  if command -v git >/dev/null 2>&1 && git -C "${REPO_ROOT}" rev-parse HEAD >/dev/null 2>&1; then
    export BACKSTEROS_BUILD_COMMIT="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
    export BACKSTEROS_BUILD_BUILT_AT="$(git -C "${REPO_ROOT}" show -s --format=%cI HEAD 2>/dev/null || date -u '+%Y-%m-%dT%H:%M:%SZ')"
    if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain 2>/dev/null || true)" ]]; then
      export BACKSTEROS_BUILD_DIRTY=1
    else
      export BACKSTEROS_BUILD_DIRTY=0
    fi
  fi
}

api_healthy() {
  curl -fsS -m 2 "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1
}

port_listening() {
  lsof -nP -iTCP:"${API_PORT}" -sTCP:LISTEN >/dev/null 2>&1
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
    interruptible_sleep 2
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

# Kill a process group (preferred) plus any remaining descendants.
kill_pgid_tree() {
  local sig="$1"
  local pgid="$2"
  local root="$3"
  [[ -z "${pgid}" && -z "${root}" ]] && return 0
  if [[ -n "${pgid}" ]]; then
    kill "-${sig}" -- "-${pgid}" 2>/dev/null || true
  fi
  if [[ -n "${root}" ]]; then
    kill "-${sig}" "${root}" 2>/dev/null || true
    local kids kid
    kids="$(pgrep -P "${root}" 2>/dev/null || true)"
    for kid in ${kids}; do
      kill_pgid_tree "${sig}" "" "${kid}"
    done
  fi
}

stop_child() {
  if ! child_alive && [[ -z "${CHILD_PGID}" ]]; then
    CHILD_PID=""
    CHILD_PGID=""
    return 0
  fi
  log "forwarding shutdown to child pgid=${CHILD_PGID:-?} pid=${CHILD_PID:-?}"
  kill_pgid_tree TERM "${CHILD_PGID}" "${CHILD_PID}"
  local waited=0
  while child_alive && (( waited < 8 )); do
    interruptible_sleep 1
    waited=$((waited + 1))
  done
  if child_alive; then
    log "child still alive after TERM; sending KILL"
    kill_pgid_tree KILL "${CHILD_PGID}" "${CHILD_PID}"
    interruptible_sleep 1
  elif [[ -n "${CHILD_PGID}" ]]; then
    # Sweep the process group even if the leader already exited.
    kill_pgid_tree KILL "${CHILD_PGID}" ""
  fi
  wait "${CHILD_PID}" 2>/dev/null || true
  CHILD_PID=""
  CHILD_PGID=""
}

# Kill anything still holding :8788 or leftover LaunchAgent API trees for this repo.
reclaim_api_port() {
  local pids pid
  pids="$(lsof -nP -iTCP:"${API_PORT}" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    log "reclaiming :${API_PORT} listeners: ${pids}"
    for pid in ${pids}; do
      kill_pgid_tree TERM "" "${pid}"
    done
    interruptible_sleep 1
    for pid in ${pids}; do
      kill_pgid_tree KILL "" "${pid}" 2>/dev/null || true
    done
  fi
  # Orphaned pnpm/tsx from earlier KeepAlive runs (often reparented to PID 1).
  local orphans
  orphans="$(
    {
      pgrep -f "${REPO_ROOT}/core/server.*src/index.ts" || true
      pgrep -f "pnpm --filter @backsteros/server" || true
      pgrep -f "pnpm exec tsx --env-file=.env src/index.ts" || true
    } 2>/dev/null | awk "NF" | sort -u
  )"
  if [[ -n "${orphans}" ]]; then
    log "killing leftover local-core API processes: $(echo "${orphans}" | tr '\n' ' ')"
    for pid in ${orphans}; do
      kill_pgid_tree TERM "" "${pid}"
    done
    interruptible_sleep 1
    for pid in ${orphans}; do
      kill_pgid_tree KILL "" "${pid}" 2>/dev/null || true
    done
  fi
  # Brief wait until the port is free.
  local waited=0
  while port_listening && (( waited < 10 )); do
    interruptible_sleep 1
    waited=$((waited + 1))
  done
}

on_signal() {
  if [[ "${SHUTTING_DOWN}" -eq 1 ]]; then
    return 0
  fi
  SHUTTING_DOWN=1
  log "received signal; shutting down"
  stop_child
  exit 0
}

trap on_signal TERM INT HUP

build_contracts() {
  log "building @backsteros/contracts (launchd start uses tsx without watch)"
  (
    cd "${REPO_ROOT}"
    pnpm --filter @backsteros/contracts build
  ) >>"${LOG_FILE}" 2>&1
}

start_api_child() {
  build_contracts
  cd "${REPO_ROOT}/core/server"
  rotate_log_if_needed
  export_build_version_env
  log "starting API: pnpm exec tsx --env-file=${ENV_FILE} src/index.ts (no watch; build=${BACKSTEROS_BUILD_COMMIT:-unknown} dirty=${BACKSTEROS_BUILD_DIRTY:-?} CORE_REPLICATION_SYNC_EVENTS_PULL=${CORE_REPLICATION_SYNC_EVENTS_PULL})"
  # Job control → own process group (macOS has no setsid(1); Homebrew pnpm is a
  # shell script so we must spawn via bash, not execvp("pnpm")).
  set -m
  pnpm exec tsx --env-file="${ENV_FILE}" src/index.ts >>"${LOG_FILE}" 2>&1 &
  CHILD_PID=$!
  set +m
  CHILD_PGID="$(ps -o pgid= -p "${CHILD_PID}" 2>/dev/null | tr -d "[:space:]")"
  if [[ -z "${CHILD_PGID}" ]]; then
    CHILD_PGID="${CHILD_PID}"
  fi
  log "API child pid ${CHILD_PID} pgid ${CHILD_PGID}"
}

fail_for_keepalive() {
  local reason="$1"
  log "${reason}; stopping child and exiting for KeepAlive restart"
  stop_child
  exit 1
}

supervise_loop() {
  local fails=0
  # Startup grace already elapsed (we only enter after /health succeeded).
  # From here, N consecutive health failures or a dead child ⇒ KeepAlive restart.
  log "supervising (health every ${HEALTH_INTERVAL_SECS}s, fail×${HEALTH_FAIL_THRESHOLD}, rotate≥${LOG_ROTATE_BYTES})"
  while true; do
    if [[ "${SHUTTING_DOWN}" -eq 1 ]]; then
      exit 0
    fi
    if ! child_alive; then
      local status=0
      wait "${CHILD_PID}" 2>/dev/null || status=$?
      fail_for_keepalive "API child exited (pid=${CHILD_PID}, wait_status=${status})"
    fi

    if api_healthy; then
      fails=0
    else
      fails=$((fails + 1))
      log "health check failed (${fails}/${HEALTH_FAIL_THRESHOLD})"
      if (( fails >= HEALTH_FAIL_THRESHOLD )); then
        fail_for_keepalive "API unhealthy for ${fails} consecutive checks"
      fi
    fi

    rotate_log_if_needed
    interruptible_sleep "${HEALTH_INTERVAL_SECS}"
  done
}

rotate_log_if_needed

if ! resolve_repo_root; then
  log "could not resolve BacksterOS repo root"
  exit 1
fi
export BACKSTEROS_REPO_ROOT="${REPO_ROOT}"
if [[ "${REPO_ROOT}" == "${LOCAL_CORE_BUILD}" ]]; then
  log "using dedicated local-core build at ${REPO_ROOT}"
else
  log "WARNING: dedicated build missing at ${LOCAL_CORE_BUILD}; using ${REPO_ROOT} (run scripts/local-core/update-build.sh)"
fi

if ! resolve_env_file; then
  log "could not find core/server/.env (set LOCAL_CORE_ENV_FILE)"
  exit 1
fi
log "env file: ${ENV_FILE}"

# OS-49: peer sync-event replay stamps updatedAt=now and can overwrite cloud.
export CORE_REPLICATION_SYNC_EVENTS_PULL="${CORE_REPLICATION_SYNC_EVENTS_PULL:-0}"

# Allow LaunchAgent / scratch tests to bind a non-default port without editing .env.
if [[ -n "${LOCAL_CORE_API_PORT:-}" ]]; then
  export PORT="${LOCAL_CORE_API_PORT}"
fi
API_PORT="${PORT:-${API_PORT}}"

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
reclaim_api_port

start_api_child

# Wait until healthy or child dies (contracts build + boot can take a while).
ready=0
for _ in $(seq 1 "${STARTUP_GRACE_SECS}"); do
  if [[ "${SHUTTING_DOWN}" -eq 1 ]]; then
    exit 0
  fi
  if api_healthy; then
    ready=1
    break
  fi
  if ! child_alive; then
    wait "${CHILD_PID}" 2>/dev/null || true
    log "API child exited before becoming healthy"
    exit 1
  fi
  interruptible_sleep 1
done
if [[ "${ready}" -ne 1 ]]; then
  fail_for_keepalive "API did not become healthy within ${STARTUP_GRACE_SECS}s"
fi
BECAME_HEALTHY_AT="$(date +%s)"
log "API healthy on 127.0.0.1:${API_PORT}"

supervise_loop
