#!/usr/bin/env bash
# Install / reload LaunchAgent: start local-core at login and restart if it dies.
#
# Points at the dedicated origin/production worktree
# (~/.backsteros/local-core-build by default). Run update-build.sh before the
# first install (or after a cloud deploy) so that tree exists.
set -euo pipefail

LABEL="com.backsteros.local-core"
HOME_DIR="${HOME}"
UID_NUM="$(id -u)"
AGENT_DIR="${HOME_DIR}/Library/LaunchAgents"
PLIST="${AGENT_DIR}/${LABEL}.plist"
LOCAL_CORE_BUILD="${BACKSTEROS_LOCAL_CORE_BUILD:-${HOME_DIR}/.backsteros/local-core-build}"
REPO_ROOT="${BACKSTEROS_REPO_ROOT:-}"
SCRIPT=""
LOG_DIR="${HOME_DIR}/.config/backsteros/desktop"
LOG_OUT="${LOG_DIR}/local-core.launchd.log"
DOMAIN="gui/${UID_NUM}/${LABEL}"
ENV_FILE="${LOCAL_CORE_ENV_FILE:-}"

resolve_build_or_repo() {
  if [[ -f "${LOCAL_CORE_BUILD}/scripts/local-core/run.sh" ]]; then
    REPO_ROOT="${LOCAL_CORE_BUILD}"
    return 0
  fi
  if [[ -n "${REPO_ROOT}" && -f "${REPO_ROOT}/scripts/local-core/run.sh" ]]; then
    return 0
  fi
  if [[ -f "${HOME_DIR}/.config/backsteros/hub.json" ]]; then
    REPO_ROOT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("repo_root") or "")' "${HOME_DIR}/.config/backsteros/hub.json" 2>/dev/null || true)"
    if [[ -n "${REPO_ROOT}" && -f "${REPO_ROOT}/scripts/local-core/run.sh" ]]; then
      return 0
    fi
  fi
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  if [[ -f "${here}/scripts/local-core/run.sh" ]]; then
    REPO_ROOT="${here}"
    return 0
  fi
  REPO_ROOT="${HOME_DIR}/BacksterOS/Projects/OS/Codebase"
  if [[ -f "${REPO_ROOT}/scripts/local-core/run.sh" ]]; then
    return 0
  fi
  return 1
}

resolve_env_file() {
  if [[ -n "${ENV_FILE}" && -f "${ENV_FILE}" ]]; then
    return 0
  fi
  if [[ -f "${HOME_DIR}/.config/backsteros/hub.json" ]]; then
    local hub_root
    hub_root="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("repo_root") or "")' "${HOME_DIR}/.config/backsteros/hub.json" 2>/dev/null || true)"
    if [[ -n "${hub_root}" && -f "${hub_root}/core/server/.env" ]]; then
      ENV_FILE="${hub_root}/core/server/.env"
      return 0
    fi
  fi
  local fallback="${HOME_DIR}/BacksterOS/Projects/OS/Codebase/core/server/.env"
  if [[ -f "${fallback}" ]]; then
    ENV_FILE="${fallback}"
    return 0
  fi
  if [[ -f "${REPO_ROOT}/core/server/.env" ]]; then
    ENV_FILE="${REPO_ROOT}/core/server/.env"
    return 0
  fi
  return 1
}

if ! resolve_build_or_repo; then
  echo "Could not find scripts/local-core/run.sh" >&2
  exit 1
fi

if [[ ! -f "${LOCAL_CORE_BUILD}/scripts/local-core/run.sh" ]]; then
  echo "WARNING: dedicated build missing at ${LOCAL_CORE_BUILD}" >&2
  echo "  Run: bash scripts/local-core/update-build.sh" >&2
  echo "  Falling back to ${REPO_ROOT} for this install." >&2
else
  REPO_ROOT="${LOCAL_CORE_BUILD}"
fi

SCRIPT="${REPO_ROOT}/scripts/local-core/run.sh"
chmod +x "${SCRIPT}"
mkdir -p "${AGENT_DIR}" "${LOG_DIR}"

if ! resolve_env_file; then
  echo "WARNING: could not resolve LOCAL_CORE_ENV_FILE; run.sh will try again at start" >&2
  ENV_FILE="${HOME_DIR}/BacksterOS/Projects/OS/Codebase/core/server/.env"
fi

# Unload if already registered (ignore missing).
if launchctl print "${DOMAIN}" >/dev/null 2>&1; then
  launchctl bootout "gui/${UID_NUM}" "${PLIST}" 2>/dev/null || true
fi

cat >"${PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ExitTimeOut</key>
  <integer>30</integer>
  <key>WorkingDirectory</key>
  <string>${REPO_ROOT}</string>
  <key>StandardOutPath</key>
  <string>${LOG_OUT}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_OUT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${HOME_DIR}</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:${HOME_DIR}/.local/bin:/usr/bin:/bin</string>
    <key>BACKSTEROS_REPO_ROOT</key>
    <string>${REPO_ROOT}</string>
    <key>BACKSTEROS_LOCAL_CORE_BUILD</key>
    <string>${LOCAL_CORE_BUILD}</string>
    <key>LOCAL_CORE_ENV_FILE</key>
    <string>${ENV_FILE}</string>
    <key>FORCE_COLOR</key>
    <string>0</string>
    <key>CORE_REPLICATION_SYNC_EVENTS_PULL</key>
    <string>0</string>
  </dict>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/${UID_NUM}" "${PLIST}"
launchctl enable "${DOMAIN}" 2>/dev/null || true
launchctl kickstart -k "${DOMAIN}" 2>/dev/null || true

echo "Installed LaunchAgent ${LABEL}"
echo "  plist:     ${PLIST}"
echo "  script:    ${SCRIPT}"
echo "  build:     ${LOCAL_CORE_BUILD}"
echo "  env file:  ${ENV_FILE}"
echo "  api log:   ${LOG_DIR}/local-core.log (copy-truncate rotate @ 32MiB)"
echo "  launchd:   ${LOG_OUT}"
echo "  bind:      127.0.0.1:${API_PORT:-8788} only (no Tailscale serve)"
echo "  env:       CORE_REPLICATION_SYNC_EVENTS_PULL=0 (OS-49 safeguard)"
echo "  update:    bash scripts/local-core/update-build.sh"
echo "  stop:      launchctl bootout gui/${UID_NUM} ${PLIST}"
echo "  start:     launchctl bootstrap gui/${UID_NUM} ${PLIST}"
