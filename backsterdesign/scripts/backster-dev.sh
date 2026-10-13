#!/usr/bin/env bash
# BacksterDESIGN local foundation — thin wrapper around Penpot manage.sh devenv.
set -euo pipefail

DESIGN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DESIGN_ROOT"

# Penpot manage.sh needs Bash 4+ (mapfile). macOS /bin/bash is 3.2 — prefer Homebrew.
BASH_BIN=""
for candidate in /opt/homebrew/bin/bash /usr/local/bin/bash; do
  if [[ -x "$candidate" ]] && "$candidate" -c '[[ ${BASH_VERSINFO[0]} -ge 4 ]]' 2>/dev/null; then
    BASH_BIN="$candidate"
    break
  fi
done
if [[ -z "$BASH_BIN" ]]; then
  echo "backster-dev: Bash 4+ required (Penpot manage.sh). Install: brew install bash" >&2
  exit 1
fi

manage() {
  "$BASH_BIN" ./manage.sh "$@"
}

if [[ ! -f ./manage.sh ]]; then
  echo "backster-dev: manage.sh missing in $DESIGN_ROOT" >&2
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
    manage pull-devenv "$@"
    ;;
  up|start|dev)
    # config.js is gitignored; Penpot serves HTML 404 without it → white screen.
    cfg="$DESIGN_ROOT/frontend/resources/public/js/config.js"
    if [[ ! -f "$cfg" ]]; then
      mkdir -p "$(dirname "$cfg")"
      if [[ -f "$DESIGN_ROOT/frontend/config.js.example" ]]; then
        cp "$DESIGN_ROOT/frontend/config.js.example" "$cfg"
      else
        cat >"$cfg" <<'EOF'
// Local devenv flags + BacksterOS bridge (gitignored).
var penpotFlags = "disable-dashboard-templates-section";
window.backsterosCore = {
  baseUrl: "http://127.0.0.1:8788",
  apiKey: "local"
};
EOF
      fi
      echo "backster-dev: created $cfg"
    fi
    echo "BacksterDESIGN: starting Penpot devenv (binds $DESIGN_ROOT → /home/penpot/penpot)"
    echo "First compile can take several minutes (shadow-cljs + libs + ui.css)."
    manage run-devenv "$@"
    echo
    echo "Open: https://localhost:3449"
    echo "Attach: pnpm --filter @backsteros/design dev:attach"
    # Ensure @penpot/ui CSS exists (copied into public/css/ui.css on package build).
    if [[ ! -f "$DESIGN_ROOT/frontend/resources/public/css/ui.css" ]] && devenv_running; then
      echo "backster-dev: building @penpot/ui (ui.css missing)…"
      docker exec -u penpot -w /home/penpot/penpot/frontend/packages/ui penpot-devenv-ws0-main \
        bash -lc 'pnpm install && pnpm run build' || true
    fi
    # Keep Backster logos / brand chrome applied (idempotent).
    if [[ -x "$DESIGN_ROOT/branding/bin/apply-to-source.sh" ]]; then
      "$DESIGN_ROOT/branding/bin/apply-to-source.sh" || true
    fi
    ;;
  down|stop)
    manage stop-devenv "$@"
    ;;
  drop)
    manage drop-devenv "$@"
    ;;
  attach)
    manage attach-devenv "$@"
    ;;
  logs)
    manage log-devenv "$@"
    ;;
  status)
    echo "BacksterDESIGN devenv"
    echo "  source: $DESIGN_ROOT"
    echo "  bash:   $BASH_BIN"
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
