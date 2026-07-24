#!/usr/bin/env bash
# Prepare an instant splash URL for `tauri:dev`, then start PTY/Next in the
# background so the native window can open without waiting on Next.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SPLASH_DIR="${APP_DIR}/desktop-shell"
SPLASH_PORT="${CONSOLE_SPLASH_PORT:-3110}"
PID_DIR="${APP_DIR}/.console-app"
SPLASH_LOG="${PID_DIR}/splash.log"
SPLASH_PID_FILE="${PID_DIR}/splash.pid"

mkdir -p "${PID_DIR}"

port_listening() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

if ! port_listening "${SPLASH_PORT}"; then
  echo "[tauri-dev] Serving splash on :${SPLASH_PORT}"
  nohup python3 -m http.server "${SPLASH_PORT}" --bind 127.0.0.1 \
    --directory "${SPLASH_DIR}" \
    >"${SPLASH_LOG}" 2>&1 &
  echo $! >"${SPLASH_PID_FILE}"
fi

for ((i = 1; i <= 50; i++)); do
  if port_listening "${SPLASH_PORT}"; then
    break
  fi
  sleep 0.1
done

if ! port_listening "${SPLASH_PORT}"; then
  echo "[tauri-dev] Splash server failed on :${SPLASH_PORT} — see ${SPLASH_LOG}" >&2
  exit 1
fi

CONSOLE_APP_BROWSER=none CONSOLE_USE_DEV=1 \
  nohup bash "${SCRIPT_DIR}/launch-console-app.sh" \
  >"${PID_DIR}/launch-bg.log" 2>&1 &

echo "[tauri-dev] Splash ready — console starting in background"
