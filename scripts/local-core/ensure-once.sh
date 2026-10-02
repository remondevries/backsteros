#!/usr/bin/env bash
# One-shot local-core ensure shared by LaunchAgent helpers and desktop
# (BACKSTEROS_START_LOCAL_REPLICA). Brings up compose and either kickstarts the
# LaunchAgent or starts a single API process until /health is OK — then exits.
# Does not supervise forever (see run.sh for KeepAlive).
set -euo pipefail

LABEL="com.backsteros.local-core-ensure"
API_PORT="${LOCAL_CORE_API_PORT:-8788}"
LOG_DIR="${HOME}/.config/backsteros/desktop"
LOG_FILE="${LOG_DIR}/local-core.log"
LOCAL_CORE_BUILD="${BACKSTEROS_LOCAL_CORE_BUILD:-${HOME}/.backsteros/local-core-build}"
REPO_ROOT="${BACKSTEROS_REPO_ROOT:-}"
ENV_FILE="${LOCAL_CORE_ENV_FILE:-}"
PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${PATH}"
export PATH

mkdir -p "${LOG_DIR}"

log() {
  local line
  line="$(date '+%Y-%m-%dT%H:%M:%S') [${LABEL}] $*"
  printf '%s\n' "${line}" >>"${LOG_FILE}" 2>/dev/null || true
  printf '%s\n' "${line}" >&2
}

api_healthy() {
  curl -fsS --max-time 2 "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1
}

port_listening() {
  lsof -nP -iTCP:"${API_PORT}" -sTCP:LISTEN >/dev/null 2>&1
}

resolve_repo_root() {
  if [[ -n "${REPO_ROOT}" && -f "${REPO_ROOT}/pnpm-workspace.yaml" && -f "${REPO_ROOT}/docker-compose.yml" ]]; then
    return 0
  fi
  if [[ -n "${LOCAL_CORE_BUILD}" \
    && -f "${LOCAL_CORE_BUILD}/pnpm-workspace.yaml" \
    && -f "${LOCAL_CORE_BUILD}/docker-compose.yml" \
    && -d "${LOCAL_CORE_BUILD}/core/server" ]]; then
    REPO_ROOT="${LOCAL_CORE_BUILD}"
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

resolve_env_file() {
  if [[ -n "${ENV_FILE}" && -f "${ENV_FILE}" ]]; then
    return 0
  fi
  local dedicated="${HOME}/.config/backsteros/local-core.env"
  if [[ -f "${dedicated}" ]]; then
    ENV_FILE="${dedicated}"
    return 0
  fi
  if [[ -f "${REPO_ROOT}/core/server/.env" ]]; then
    ENV_FILE="${REPO_ROOT}/core/server/.env"
    return 0
  fi
  local fallback="${HOME}/BacksterOS/Projects/OS/Codebase/core/server/.env"
  if [[ -f "${fallback}" ]]; then
    ENV_FILE="${fallback}"
    return 0
  fi
  return 1
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
  wait_for_docker
  local compose_root="${REPO_ROOT}"
  if [[ -f "${LOCAL_CORE_BUILD}/docker-compose.yml" ]]; then
    compose_root="${LOCAL_CORE_BUILD}"
  fi
  log "docker compose up -d postgres mongo powersync (cwd=${compose_root})"
  (
    cd "${compose_root}"
    docker compose up -d postgres mongo powersync
  ) || {
    log "compose up reported an error; starting existing containers"
    docker start backsteros-postgres backsteros-powersync-mongo >/dev/null 2>&1 || true
  }
}

kickstart_launch_agent() {
  local uid plist
  uid="$(id -u)"
  plist="${HOME}/Library/LaunchAgents/com.backsteros.local-core.plist"
  if [[ ! -f "${plist}" ]]; then
    return 1
  fi
  log "kickstarting LaunchAgent com.backsteros.local-core"
  launchctl kickstart -k "gui/${uid}/com.backsteros.local-core" 2>/dev/null \
    || launchctl bootstrap "gui/${uid}" "${plist}" 2>/dev/null \
    || return 1
  return 0
}

start_api_once() {
  log "building @backsteros/contracts"
  (
    cd "${REPO_ROOT}"
    pnpm --filter @backsteros/contracts build
  ) >>"${LOG_FILE}" 2>&1
  cd "${REPO_ROOT}/core/server"
  log "starting one-shot API via env-file=${ENV_FILE}"
  # shellcheck disable=SC1090
  set -a
  # Prefer env-file flag on tsx; also export HOST/PORT clamps for safety.
  set +a
  nohup pnpm exec tsx --env-file="${ENV_FILE}" src/index.ts >>"${LOG_FILE}" 2>&1 &
  disown || true
}

wait_until_healthy() {
  local started waited=0
  started="$(date +%s)"
  while ! api_healthy; do
    if (( $(date +%s) - started > 90 )); then
      log "API did not become healthy within 90s"
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  log "API healthy after ${waited}s"
  return 0
}

if ! resolve_repo_root; then
  log "could not resolve repo root"
  exit 1
fi
if ! resolve_env_file; then
  log "could not find local-core env (set ~/.config/backsteros/local-core.env or LOCAL_CORE_ENV_FILE)"
  exit 1
fi
log "repo=${REPO_ROOT} env=${ENV_FILE}"

if api_healthy; then
  log "already healthy"
  exit 0
fi

ensure_compose

if api_healthy; then
  log "healthy after compose"
  exit 0
fi

if port_listening; then
  log "port :${API_PORT} in use but /health not OK — refusing a second API"
  exit 1
fi

if kickstart_launch_agent; then
  if wait_until_healthy; then
    exit 0
  fi
  log "LaunchAgent kickstart did not yield a healthy API; trying one-shot start"
fi

start_api_once
wait_until_healthy
