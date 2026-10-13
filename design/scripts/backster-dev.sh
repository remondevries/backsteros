#!/usr/bin/env bash
# BacksterDESIGN local foundation — thin wrapper around Penpot manage.sh devenv.
set -euo pipefail

DESIGN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DESIGN_ROOT"

if [[ ! -x ./manage.sh ]]; then
  echo "backster-dev: manage.sh missing or not executable in $DESIGN_ROOT" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "backster-dev: docker is required (Penpot devenv runs in Docker)." >&2
  exit 1
fi

usage() {
  cat <<'EOF'
BacksterDESIGN local devenv

  up | start | dev     Pull devenv image if needed, start workspace (ws0)
  down | stop          Stop workspace (and shared infra if idle)
  drop                 Stop + remove devenv image (full teardown)
  attach               Attach to tmux inside the devenv container
  logs                 Tail devenv compose logs
  pull                 Pull penpotapp/devenv image
  status               Show tree pin + whether devenv containers are up
  help                 This help

Examples (from repo root):
  pnpm --filter @backsteros/design dev
  pnpm --filter @backsteros/design dev:down
  pnpm --filter @backsteros/design dev:attach

App URL when up: https://localhost:3449  (HTTP :3450)
EOF
}

devenv_running() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^penpot-devenv-ws0-main$'
}

cmd="${1:-help}"
shift || true

case "$cmd" in
  help|-h|--help)
    usage
    ;;
  pull)
    ./manage.sh pull-devenv "$@"
    ;;
  up|start|dev)
    echo "BacksterDESIGN: starting Penpot devenv (binds $DESIGN_ROOT → /home/penpot/penpot)"
    ./manage.sh run-devenv "$@"
    echo
    echo "Open: https://localhost:3449"
    echo "Attach: pnpm --filter @backsteros/design dev:attach"
    ;;
  down|stop)
    ./manage.sh stop-devenv "$@"
    ;;
  drop)
    ./manage.sh drop-devenv "$@"
    ;;
  attach)
    ./manage.sh attach-devenv "$@"
    ;;
  logs)
    ./manage.sh log-devenv "$@"
    ;;
  status)
    echo "BacksterDESIGN devenv"
    echo "  source: $DESIGN_ROOT"
    if [[ -f BACKSTER.md ]]; then
      pin="$(grep -E 'Penpot \*\*' BACKSTER.md | head -1 || true)"
      [[ -n "$pin" ]] && echo "  $pin"
    fi
    if devenv_running; then
      echo "  devenv: running (penpot-devenv-ws0-main)"
      echo "  url:    https://localhost:3449"
    else
      echo "  devenv: stopped"
      echo "  start:  pnpm --filter @backsteros/design dev"
    fi
    ;;
  *)
    echo "backster-dev: unknown command '$cmd'" >&2
    usage >&2
    exit 2
    ;;
esac
