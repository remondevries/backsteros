#!/usr/bin/env bash
# One-shot local-core ensure shared by LaunchAgent helpers and desktop
# (BACKSTEROS_START_LOCAL_REPLICA). Brings up compose and kickstarts the
# LaunchAgent until /health is OK — then exits.
# Does not supervise forever (see run.sh for KeepAlive).
# Does NOT start an unsupervised API process — LaunchAgent is the only runner.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

LOCAL_CORE_LOG_LABEL="com.backsteros.local-core-ensure"
export LOCAL_CORE_LOG_LABEL

local_core_wait_until_healthy() {
  local started waited=0
  started="$(date +%s)"
  while ! local_core_api_healthy; do
    if (( $(date +%s) - started > 90 )); then
      local_core_log "API did not become healthy within 90s"
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  local_core_log "API healthy after ${waited}s"
  return 0
}

if ! local_core_resolve_repo_root; then
  local_core_log "could not resolve repo root"
  exit 1
fi
if ! local_core_resolve_env_file; then
  local_core_log "could not find local-core env (set ~/.config/backsteros/local-core.env or LOCAL_CORE_ENV_FILE)"
  exit 1
fi
local_core_log "repo=${REPO_ROOT} env=${ENV_FILE}"

if local_core_api_healthy; then
  local_core_log "already healthy"
  exit 0
fi

local_core_ensure_compose

if local_core_api_healthy; then
  local_core_log "healthy after compose"
  exit 0
fi

if local_core_port_listening; then
  local_core_log "port :${API_PORT} in use but /health not OK — refusing a second API"
  exit 1
fi

if ! local_core_kickstart_launch_agent; then
  local_core_log "LaunchAgent missing or kickstart failed — install via scripts/local-core/install-launch-agent.sh"
  exit 1
fi

if ! local_core_wait_until_healthy; then
  local_core_log "LaunchAgent kickstart did not yield a healthy API (no unsupervised fallback)"
  exit 1
fi

exit 0
