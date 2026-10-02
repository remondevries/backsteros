#!/usr/bin/env bash
# Shared helpers for local-core run.sh (LaunchAgent) and ensure-once.sh (one-shot).
# Source from those scripts; do not exec this file directly.
# shellcheck shell=bash

: "${API_PORT:=${LOCAL_CORE_API_PORT:-8788}}"
: "${LOG_DIR:=${HOME}/.config/backsteros/desktop}"
: "${LOG_FILE:=${LOG_DIR}/local-core.log}"
: "${LOCAL_CORE_BUILD:=${BACKSTEROS_LOCAL_CORE_BUILD:-${HOME}/.backsteros/local-core-build}}"
: "${REPO_ROOT:=${BACKSTEROS_REPO_ROOT:-}}"
: "${ENV_FILE:=${LOCAL_CORE_ENV_FILE:-}}"

# Live stack project name. Plain `docker compose` without this env uses the
# worktree-safe default in docker-compose.yml and cannot touch live containers.
export BACKSTEROS_COMPOSE_PROJECT="${BACKSTEROS_COMPOSE_PROJECT:-backsteros}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-${BACKSTEROS_COMPOSE_PROJECT}}"

PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${PATH}"
export PATH

mkdir -p "${LOG_DIR}"

local_core_log() {
  local label="${LOCAL_CORE_LOG_LABEL:-com.backsteros.local-core}"
  local line
  line="$(date '+%Y-%m-%dT%H:%M:%S') [${label}] $*"
  printf '%s\n' "${line}" >>"${LOG_FILE}" 2>/dev/null || true
  printf '%s\n' "${line}" >&2
}

local_core_api_healthy() {
  curl -fsS --max-time 2 "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1
}

local_core_port_listening() {
  lsof -nP -iTCP:"${API_PORT}" -sTCP:LISTEN >/dev/null 2>&1
}

local_core_resolve_repo_root() {
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

local_core_resolve_env_file() {
  if [[ -n "${ENV_FILE}" && -f "${ENV_FILE}" ]]; then
    return 0
  fi
  local dedicated="${HOME}/.config/backsteros/local-core.env"
  if [[ -f "${dedicated}" ]]; then
    ENV_FILE="${dedicated}"
    return 0
  fi
  if [[ -n "${REPO_ROOT}" && -f "${REPO_ROOT}/core/server/.env" ]]; then
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

local_core_wait_for_docker() {
  local started
  started="$(date +%s)"
  if docker info >/dev/null 2>&1; then
    return 0
  fi
  local_core_log "docker daemon down; opening Docker.app"
  open -a Docker >/dev/null 2>&1 || true
  while ! docker info >/dev/null 2>&1; do
    if (( $(date +%s) - started > 120 )); then
      local_core_log "Docker daemon did not become ready within 120s"
      return 1
    fi
    sleep 2
  done
}

local_core_compose_root() {
  if [[ -f "${LOCAL_CORE_BUILD}/docker-compose.yml" ]]; then
    printf '%s\n' "${LOCAL_CORE_BUILD}"
  else
    printf '%s\n' "${REPO_ROOT}"
  fi
}

local_core_ensure_compose() {
  local_core_wait_for_docker
  local compose_root
  compose_root="$(local_core_compose_root)"
  local_core_log "docker compose up -d postgres mongo powersync (cwd=${compose_root} project=${COMPOSE_PROJECT_NAME})"
  if ! (
    cd "${compose_root}"
    docker compose up -d postgres mongo powersync
  ); then
    local_core_log "compose up reported an error; starting existing live containers"
    docker start backsteros-postgres backsteros-powersync-mongo >/dev/null 2>&1 || true
    docker network connect --alias mongo backsteros_default backsteros-powersync-mongo >/dev/null 2>&1 || true
    docker network connect --alias mongo codebase_default backsteros-powersync-mongo >/dev/null 2>&1 || true
    docker network connect --alias postgres backsteros_default backsteros-postgres >/dev/null 2>&1 || true
    docker network connect --alias postgres codebase_default backsteros-postgres >/dev/null 2>&1 || true
  fi
  local_core_ensure_compose_dns_aliases
}

local_core_ensure_compose_dns_aliases() {
  docker network connect --alias postgres backsteros_default backsteros-postgres >/dev/null 2>&1 || true
  docker network connect --alias postgres codebase_default backsteros-postgres >/dev/null 2>&1 || true
  docker network connect --alias mongo backsteros_default backsteros-powersync-mongo >/dev/null 2>&1 || true
  docker network connect --alias mongo codebase_default backsteros-powersync-mongo >/dev/null 2>&1 || true
}

local_core_kickstart_launch_agent() {
  local uid plist
  uid="$(id -u)"
  plist="${HOME}/Library/LaunchAgents/com.backsteros.local-core.plist"
  if [[ ! -f "${plist}" ]]; then
    return 1
  fi
  local_core_log "kickstarting LaunchAgent com.backsteros.local-core"
  launchctl kickstart -k "gui/${uid}/com.backsteros.local-core" 2>/dev/null \
    || launchctl bootstrap "gui/${uid}" "${plist}" 2>/dev/null \
    || return 1
  return 0
}
