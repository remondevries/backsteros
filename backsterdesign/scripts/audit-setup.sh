#!/usr/bin/env bash
# Audit local devenv + hosted design.lemo-design.com. Never prints secrets.
set -euo pipefail

DESIGN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS="${BACKSTERDESIGN_SECRETS:-$HOME/.config/secrets/backsterdesign.env}"
PASS=0
FAIL=0
WARN=0

ok()   { PASS=$((PASS+1)); echo "  OK  $*"; }
fail() { FAIL=$((FAIL+1)); echo "  FAIL $*"; }
warn() { WARN=$((WARN+1)); echo "  WARN $*"; }

section() { echo; echo "== $* =="; }

have() { command -v "$1" >/dev/null 2>&1; }

redact_config() {
  sed -E 's/(apiKey: ")[^"]+"/\1***/; s/(sk_live_)[A-Za-z0-9_]+/\1***/'
}

check_http() {
  local label="$1" url="$2" expect="${3:-200}"
  local code
  code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 "$url" || echo 000)
  if [[ "$code" == "$expect" ]]; then ok "$label ($code)"; else fail "$label (got $code, want $expect)"; fi
}

check_flag_in_url() {
  local label="$1" url="$2" flag="$3"
  if curl -sk --max-time 20 "$url" | grep -q "$flag"; then ok "$label has $flag"
  else fail "$label missing $flag"; fi
}

staff_login() {
  local label="$1" base="$2"
  if [[ ! -f "$SECRETS" ]]; then warn "$label login skipped (no $SECRETS)"; return; fi
  # shellcheck disable=SC1090
  set -a; source "$SECRETS"; set +a
  local email="${BACKSTERDESIGN_STAFF_EMAIL:-}"
  local password="${BACKSTERDESIGN_STAFF_PASSWORD:-}"
  password="${password%\'}"; password="${password#\'}"
  password="${password%\"}"; password="${password#\"}"
  if [[ -z "$email" || -z "$password" ]]; then warn "$label login skipped (empty creds)"; return; fi
  local code
  code=$(python3 - "$base" "$email" "$password" <<'PY'
import json, ssl, sys, urllib.request
base, email, password = sys.argv[1], sys.argv[2], sys.argv[3]
body = json.dumps(["^ ", "~:email", email, "~:password", password]).encode()
ctx = ssl.create_default_context()
if base.startswith("https://localhost"):
    ctx = ssl._create_unverified_context()
req = urllib.request.Request(
    base.rstrip("/") + "/api/rpc/command/login-with-password",
    data=body,
    headers={"Content-Type": "application/transit+json", "Accept": "application/transit+json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        print(r.status)
except Exception as e:
    print(getattr(e, "code", 0))
PY
)
  if [[ "$code" == "200" ]]; then ok "$label staff login"; else fail "$label staff login (HTTP $code)"; fi
}

section "Local devenv"
if docker ps --format '{{.Names}}' | grep -q '^penpot-devenv-ws0-main$'; then
  ok "container penpot-devenv-ws0-main running"
else
  fail "container penpot-devenv-ws0-main not running"
fi

CFG="$DESIGN_ROOT/frontend/resources/public/js/config.js"
if [[ -f "$CFG" ]]; then ok "config.js on disk"
else fail "config.js missing (run ./scripts/backster-dev.sh status)"; fi

check_http "local https root" "https://localhost:3449/"
check_http "local config.js" "https://localhost:3449/js/config.js"
check_flag_in_url "local config" "https://localhost:3449/js/config.js" "disable-dashboard-templates-section"
check_flag_in_url "local config" "https://localhost:3449/js/config.js" 'baseUrl: "https://agent.backsteros.com"'
check_http "cloud-core agent door" "https://agent.backsteros.com/api/v1/health"
check_http "local-core :8788 (optional FS replica)" "http://127.0.0.1:8788/api/v1/health"
staff_login "local" "https://localhost:3449"

MAIN_JS="$DESIGN_ROOT/frontend/resources/public/js/main.js"
BRIDGE="$DESIGN_ROOT/frontend/src/app/main/ui/dashboard/backsteros_bridge.cljs"
if [[ -f "$MAIN_JS" && -f "$BRIDGE" ]]; then
  if [[ "$MAIN_JS" -nt "$BRIDGE" ]] || [[ ! "$BRIDGE" -nt "$MAIN_JS" ]]; then
    # -nt: main newer or equal enough — warn only if bridge clearly newer
    if [[ "$BRIDGE" -nt "$MAIN_JS" ]]; then
      warn "main.js older than backsteros_bridge.cljs (frontend watch may be down)"
    else
      ok "main.js not older than bridge sources"
    fi
  fi
else
  warn "could not compare main.js vs bridge sources"
fi

if docker exec -u penpot penpot-devenv-ws0-main bash -lc 'pgrep -f "shadow.cljs.devtools.cli watch" >/dev/null' 2>/dev/null; then
  ok "shadow-cljs watch running"
else
  warn "shadow-cljs watch not running (start: tmux ./scripts/watch app, or compile main)"
fi

CERT="$DESIGN_ROOT/docker/devenv/files/selfsigned.crt"
if [[ -f "$CERT" ]] && security verify-cert -c "$CERT" >/dev/null 2>&1; then
  ok "devenv TLS cert trusted in login keychain"
else
  warn "devenv TLS cert not trusted (WKWebView may blank)"
fi

section "Hosted design.lemo-design.com"
check_http "hosted https root" "https://design.lemo-design.com/"
check_http "hosted config.js" "https://design.lemo-design.com/js/config.js"
check_flag_in_url "hosted config" "https://design.lemo-design.com/js/config.js" "disable-dashboard-templates-section"
check_flag_in_url "hosted config" "https://design.lemo-design.com/js/config.js" "disable-registration"
check_flag_in_url "hosted config" "https://design.lemo-design.com/js/config.js" 'penpotPublicURI = "https://design.lemo-design.com"'
check_flag_in_url "hosted config" "https://design.lemo-design.com/js/config.js" 'baseUrl: "/backsteros-core"'
check_http "hosted /backsteros-core health" "https://design.lemo-design.com/backsteros-core/api/v1/health"
staff_login "hosted" "https://design.lemo-design.com"

if have dig; then
  ip=$(dig +short design.lemo-design.com A | head -1)
  if [[ "$ip" == "188.34.196.92" ]]; then ok "DNS A → $ip"; else warn "DNS A → ${ip:-none} (expected 188.34.196.92)"; fi
fi

if have ssh; then
  if ssh -o BatchMode=yes -o ConnectTimeout=12 lemodesign 'cd /home/deploy/backsterdesign && \
      grep -q "^PENPOT_OBJECTS_STORAGE_S3_BUCKET=backsteros-files" .env && \
      grep -q "^PENPOT_FILE_DATA_BACKEND=storage" .env && \
      grep -q "^BACKSTEROS_API_KEY=sk_live_" .env && \
      test -f config.js && \
      docker compose ps --status running -q | wc -l | grep -qE "^[1-9]"' 2>/dev/null; then
    ok "lemodesign .env + stack running"
  else
    fail "lemodesign remote checks failed (ssh/env/compose)"
  fi

  if ssh -o BatchMode=yes -o ConnectTimeout=10 development \
      'docker compose -p penpot ps --status running -q 2>/dev/null | wc -l' 2>/dev/null \
      | grep -qE '^[1-9]'; then
    warn "legacy ssh development Penpot still running (freeze after cutover)"
  else
    ok "legacy development Penpot not running (or unreachable)"
  fi
else
  warn "ssh not available for remote checks"
fi

section "Desktop shell"
if pgrep -f 'target/debug/BacksterDESIGN' >/dev/null 2>&1; then
  uri=$(ps eww -p "$(pgrep -f 'target/debug/BacksterDESIGN' | head -1)" 2>/dev/null \
    | tr ' ' '\n' | grep '^PENPOT_PUBLIC_URI=' || true)
  if [[ "$uri" == *'localhost:3449'* ]]; then ok "tauri:dev → localhost:3449"
  elif [[ -n "$uri" ]]; then warn "tauri:dev URI $uri"
  else ok "tauri:dev process present"; fi
else
  warn "tauri:dev not running"
fi

if [[ -d /Applications/BacksterDESIGN.app ]]; then
  ok "installed BacksterDESIGN.app present (release → hosted)"
else
  warn "no /Applications/BacksterDESIGN.app"
fi

section "Summary"
echo "  pass=$PASS warn=$WARN fail=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
exit 0
