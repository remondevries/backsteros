#!/usr/bin/env bash
# BacksterDESIGN local foundation — thin wrapper around Penpot manage.sh devenv.
set -euo pipefail

DESIGN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$DESIGN_ROOT/.." && pwd)"
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
  ensure-staff         Sync staff email/password from ~/.config/secrets/backsterdesign.env
  audit                Check local + hosted setup (no secrets printed)
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

# Owner sk_live_… for cloud-core timer / Projects bridge (never print the value).
read_cli_api_key() {
  local cli_env="${HOME}/.config/backsteros/cli.env"
  [[ -f "$cli_env" ]] || return 0
  local line
  line="$(grep -E '^(export[[:space:]]+)?BACKSTEROS_API_KEY=' "$cli_env" | head -1 || true)"
  [[ -n "$line" ]] || return 0
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$line"
}

# config.js is gitignored; without it nginx 404s and default flags show
# Libraries & Templates (enable-dashboard-templates-section).
# Timer chrome + Projects bridge use cloud-core (agent.backsteros.com).
ensure_frontend_config_js() {
  local cfg="$DESIGN_ROOT/frontend/resources/public/js/config.js"
  local api_key
  api_key="$(read_cli_api_key || true)"

  mkdir -p "$(dirname "$cfg")"
  if [[ ! -f "$cfg" ]]; then
    if [[ -f "$DESIGN_ROOT/frontend/config.js.example" ]]; then
      cp "$DESIGN_ROOT/frontend/config.js.example" "$cfg"
    else
      cat >"$cfg" <<'EOF'
// Local devenv flags + BacksterOS cloud-core bridge (gitignored).
var penpotFlags = "disable-dashboard-templates-section";
window.backsterosCore = {
  baseUrl: "https://agent.backsteros.com",
  apiKey: "sk_live_REPLACE_ME"
};
EOF
    fi
    echo "backster-dev: created $cfg"
  fi

  if ! grep -q 'disable-dashboard-templates-section' "$cfg"; then
    if grep -q 'var penpotFlags' "$cfg"; then
      sed -i.bak -E \
        's/var penpotFlags = "([^"]*)"/var penpotFlags = "\1 disable-dashboard-templates-section"/' \
        "$cfg"
      perl -i -pe 's/(disable-dashboard-templates-section\s*)+/$1/g' "$cfg" 2>/dev/null || true
      rm -f "${cfg}.bak"
      echo "backster-dev: added disable-dashboard-templates-section to $cfg"
    fi
  fi

  # Point local devenv at cloud-core (same timer list as OS / DEV).
  if grep -qE 'baseUrl:[[:space:]]*"/backsteros-core"' "$cfg" \
    || grep -qE 'baseUrl:[[:space:]]*"http://127\.0\.0\.1:8788"' "$cfg" \
    || grep -qE 'apiKey:[[:space:]]*"local"' "$cfg"; then
    perl -i -pe 's|baseUrl:\s*"[^"]*"|baseUrl: "https://agent.backsteros.com"|' "$cfg"
    if [[ -n "$api_key" && "$api_key" == sk_live_* ]]; then
      # Escape for double-quoted JS string (key is hex-ish; still quote-safe).
      local escaped
      escaped="$(printf '%s' "$api_key" | sed 's/[\\"]/\\&/g')"
      perl -i -pe "s|apiKey:\\s*\"[^\"]*\"|apiKey: \"${escaped}\"|" "$cfg"
    fi
    echo "backster-dev: pointed config.js at cloud-core (agent.backsteros.com)"
  elif [[ -n "$api_key" && "$api_key" == sk_live_* ]] \
    && grep -qE 'apiKey:[[:space:]]*"sk_live_REPLACE_ME"' "$cfg"; then
    local escaped
    escaped="$(printf '%s' "$api_key" | sed 's/[\\"]/\\&/g')"
    perl -i -pe "s|apiKey:\\s*\"[^\"]*\"|apiKey: \"${escaped}\"|" "$cfg"
    echo "backster-dev: filled cloud-core apiKey from cli.env"
  fi
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
    ensure_frontend_config_js
    echo "BacksterDESIGN: starting Penpot devenv (binds $DESIGN_ROOT → /home/penpot/penpot)"
    echo "First compile can take several minutes (shadow-cljs + libs + ui.css)."
    manage run-devenv "$@"
    echo
    echo "Open: https://localhost:3449"
    echo "Attach: pnpm --filter @backsteros/design dev:attach"
    # devenv image bakes nginx.conf at build time; sync bind-mounted source + reload
    # so /backsteros-core → host:8788 works without rebuilding the image.
    if devenv_running; then
      docker exec -u root penpot-devenv-ws0-main bash -lc \
        'cp /home/penpot/penpot/docker/devenv/files/nginx.conf /etc/nginx/nginx.conf && nginx -t && nginx -s reload' \
        && echo "backster-dev: synced nginx.conf (/backsteros-core proxy)" \
        || echo "backster-dev: warning — could not sync nginx.conf" >&2
    fi
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
    # Shared @backsteros/ui task island (host build → public/js + public/css).
    if [[ ! -f "$DESIGN_ROOT/frontend/resources/public/js/backsteros-project-tasks.js" ]]; then
      echo "backster-dev: building @backsteros/design-bridge (project tasks island)…"
      (cd "$REPO_ROOT" && pnpm --filter @backsteros/design-bridge build) || \
        echo "backster-dev: warning — design-bridge build failed" >&2
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
    ensure_frontend_config_js
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
      echo "  config: frontend/resources/public/js/config.js (templates disabled)"
    else
      echo "  devenv: stopped"
      echo "  start:  pnpm --filter @backsteros/design dev"
    fi
    ;;
  ensure-staff)
    "$DESIGN_ROOT/scripts/ensure-staff-account.sh" local
    ;;
  audit)
    "$DESIGN_ROOT/scripts/audit-setup.sh"
    ;;
  *)
    echo "backster-dev: unknown command '$cmd'" >&2
    usage >&2
    exit 2
    ;;
esac
