#!/usr/bin/env bash
# Start BacksterOS Development (PTY + Next) and open it in an app-style
# window. No UI rewrite — same Next.js codebase as `pnpm dev`.
#
# Usage:
#   ./scripts/launch-console-app.sh
#   pnpm app
#
# Env:
#   PORT                 Next port (default 3100)
#   PTY_PORT             PTY bridge port (default 3101)
#   CONSOLE_APP_BROWSER  chrome | edge | safari | none (default: chrome)
#   CONSOLE_SKIP_BUILD   1 = do not run next build if .next is missing
#   CONSOLE_USE_DEV      1 = use `next dev` instead of production start

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${APP_DIR}/.." && pwd)"
PORT="${PORT:-3100}"
PTY_PORT="${PTY_PORT:-3101}"
URL="http://127.0.0.1:${PORT}"
BROWSER="${CONSOLE_APP_BROWSER:-chrome}"
PID_DIR="${APP_DIR}/.console-app"
PTY_LOG="${PID_DIR}/pty.log"
NEXT_LOG="${PID_DIR}/next.log"
PTY_PID_FILE="${PID_DIR}/pty.pid"
NEXT_PID_FILE="${PID_DIR}/next.pid"

mkdir -p "${PID_DIR}"

# GUI apps (LaunchServices / Tauri) inherit a minimal PATH without Homebrew,
# nvm, or pnpm. Bootstrap common locations before we look for tooling.
ensure_devtools_path() {
  local dirs=(
    "/opt/homebrew/bin"
    "/opt/homebrew/sbin"
    "/usr/local/bin"
    "/usr/local/sbin"
    "${HOME}/.local/bin"
    "${HOME}/Library/pnpm"
    "${HOME}/.bun/bin"
    "${HOME}/.cargo/bin"
  )
  local nvm_dir="${NVM_DIR:-${HOME}/.nvm}"
  if [[ -d "${nvm_dir}/versions/node" ]]; then
    local latest
    latest="$(ls -1d "${nvm_dir}/versions/node"/v*/bin 2>/dev/null | sort -V | tail -1 || true)"
    if [[ -n "${latest}" ]]; then
      dirs+=("${latest}")
    fi
  fi
  local prefix=""
  local d
  for d in "${dirs[@]}"; do
    if [[ -d "${d}" ]]; then
      case ":${PATH:-}:" in
        *":${d}:"*) ;;
        *) prefix="${prefix}${prefix:+:}${d}" ;;
      esac
    fi
  done
  if [[ -n "${prefix}" ]]; then
    export PATH="${prefix}:${PATH:-/usr/bin:/bin:/usr/sbin:/sbin}"
  fi
}

ensure_devtools_path

port_listening() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-60}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    # Fail closed on hung accept-no-response servers (port open, no HTTP).
    if curl -sf -o /dev/null --max-time 2 "${url}"; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

http_ready() {
  local url="$1"
  curl -sf -o /dev/null --max-time 5 "${url}" >/dev/null 2>&1
}

kill_port_listeners() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
      echo "[console-app] Killing stale listener(s) on :${port}: ${pids}"
      # shellcheck disable=SC2086
      kill ${pids} 2>/dev/null || true
      sleep 0.4
      # shellcheck disable=SC2086
      kill -9 ${pids} 2>/dev/null || true
    fi
  fi
}

open_app_window() {
  case "${BROWSER}" in
    none)
      echo "[console-app] Services up at ${URL} (window not opened)."
      ;;
    safari)
      open "${URL}"
      ;;
    edge)
      if open -na "Microsoft Edge" --args --app="${URL}" 2>/dev/null; then
        return 0
      fi
      open "${URL}"
      ;;
    chrome|*)
      if open -na "Google Chrome" --args --app="${URL}" 2>/dev/null; then
        return 0
      fi
      # Chromium / fallback
      if open -na "Chromium" --args --app="${URL}" 2>/dev/null; then
        return 0
      fi
      echo "[console-app] Chrome app mode unavailable — opening default browser."
      open "${URL}"
      ;;
  esac
}

ensure_ui_built() {
  if [[ ! -d "${REPO_ROOT}/backsteros-packages/ui/dist" ]]; then
    echo "[console-app] Building @backsteros/ui…"
    (cd "${REPO_ROOT}" && pnpm --filter @backsteros/ui build)
  fi
}

ensure_next_built() {
  if [[ "${CONSOLE_USE_DEV:-}" == "1" ]]; then
    return 0
  fi
  if [[ -d "${APP_DIR}/.next" ]]; then
    return 0
  fi
  if [[ "${CONSOLE_SKIP_BUILD:-}" == "1" ]]; then
    echo "[console-app] No .next build and CONSOLE_SKIP_BUILD=1 — cannot start." >&2
    exit 1
  fi
  echo "[console-app] Building Next.js console (first run)…"
  (cd "${APP_DIR}" && pnpm build)
}

start_pty() {
  if port_listening "${PTY_PORT}"; then
    echo "[console-app] PTY already on :${PTY_PORT}"
    return 0
  fi
  echo "[console-app] Starting PTY on :${PTY_PORT}…"
  (
    cd "${APP_DIR}"
    # shellcheck disable=SC1091
    export PTY_PORT
    nohup pnpm pty >"${PTY_LOG}" 2>&1 &
    echo $! >"${PTY_PID_FILE}"
  )
  local i
  for ((i = 1; i <= 40; i++)); do
    if port_listening "${PTY_PORT}"; then
      return 0
    fi
    sleep 0.25
  done
  echo "[console-app] PTY failed to listen on :${PTY_PORT} — see ${PTY_LOG}" >&2
  exit 1
}

start_next() {
  # Avoid killing a healthy/starting Next: a concurrent launch (e.g. Tauri
  # shell) used to see "port open, HTTP not ready yet" and SIGKILL Turbopack.
  if port_listening "${PORT}"; then
    if http_ready "${URL}"; then
      echo "[console-app] Next already on :${PORT}"
      return 0
    fi
    echo "[console-app] :${PORT} is listening — waiting for HTTP before considering restart…"
    local i
    for ((i = 1; i <= 60; i++)); do
      if http_ready "${URL}"; then
        echo "[console-app] Next became ready on :${PORT}"
        return 0
      fi
      if ! port_listening "${PORT}"; then
        break
      fi
      sleep 0.5
    done
    if http_ready "${URL}"; then
      echo "[console-app] Next already on :${PORT}"
      return 0
    fi
    echo "[console-app] :${PORT} still not serving HTTP — restarting Next"
    kill_port_listeners "${PORT}"
  fi
  echo "[console-app] Starting Next on :${PORT}…"
  # Turbopack watches the monorepo; the default soft limit (256) is too low.
  ulimit -n 10240 2>/dev/null || true
  (
    cd "${APP_DIR}"
    export PORT
    {
      echo ""
      echo "----- $(date '+%Y-%m-%d %H:%M:%S') next start (CONSOLE_USE_DEV=${CONSOLE_USE_DEV:-0}) -----"
    } >>"${NEXT_LOG}"
    if [[ "${CONSOLE_USE_DEV:-}" == "1" ]]; then
      nohup pnpm exec next dev --port "${PORT}" >>"${NEXT_LOG}" 2>&1 &
    else
      nohup pnpm exec next start --port "${PORT}" >>"${NEXT_LOG}" 2>&1 &
    fi
    echo $! >"${NEXT_PID_FILE}"
  )
  if ! wait_for_http "${URL}"; then
    echo "[console-app] Next failed to become ready at ${URL} — see ${NEXT_LOG}" >&2
    exit 1
  fi
}

cd "${APP_DIR}"

# Prefer repo-root pnpm when available
if [[ -f "${REPO_ROOT}/pnpm-workspace.yaml" ]] && command -v pnpm >/dev/null 2>&1; then
  :
elif ! command -v pnpm >/dev/null 2>&1; then
  echo "[console-app] pnpm not found on PATH." >&2
  exit 1
fi

ensure_ui_built
ensure_next_built
start_pty
start_next
open_app_window

echo "[console-app] Ready — ${URL}"
echo "[console-app] Logs: ${PTY_LOG}  ${NEXT_LOG}"
echo "[console-app] Tip: API should be running separately (e.g. pnpm dev in the repo for :8787)."
