#!/usr/bin/env bash
# Install / reload LaunchAgent: start local-core at login and restart if it dies.
set -euo pipefail

LABEL="com.backsteros.local-core"
HOME_DIR="${HOME}"
UID_NUM="$(id -u)"
AGENT_DIR="${HOME_DIR}/Library/LaunchAgents"
PLIST="${AGENT_DIR}/${LABEL}.plist"
REPO_ROOT="${BACKSTEROS_REPO_ROOT:-}"
SCRIPT=""
LOG_DIR="${HOME_DIR}/.config/backsteros/desktop"
LOG_OUT="${LOG_DIR}/local-core.launchd.log"
DOMAIN="gui/${UID_NUM}/${LABEL}"

resolve_repo_root() {
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

if ! resolve_repo_root; then
  echo "Could not find scripts/local-core/run.sh" >&2
  exit 1
fi

SCRIPT="${REPO_ROOT}/scripts/local-core/run.sh"
chmod +x "${SCRIPT}"
mkdir -p "${AGENT_DIR}" "${LOG_DIR}"

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
echo "  api log:   ${LOG_DIR}/local-core.log (copy-truncate rotate @ 32MiB)"
echo "  launchd:   ${LOG_OUT}"
echo "  bind:      127.0.0.1:${API_PORT:-8788} only (no Tailscale serve)"
echo "  env:       CORE_REPLICATION_SYNC_EVENTS_PULL=0 (OS-49 safeguard)"
echo "  stop:      launchctl bootout gui/${UID_NUM} ${PLIST}"
echo "  start:     launchctl bootstrap gui/${UID_NUM} ${PLIST}"
