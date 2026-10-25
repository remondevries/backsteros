#!/usr/bin/env bash
# Build the agents door (agent.backsteros.com) locally, rsync it to the VPS,
# restart systemd, then verify /health reports this commit.
#
# Run from repo root on your Mac:
#   ./deploy/agents/deploy-agents.sh [--rollback]
#
#   --rollback   restore the previous dist/ + build-info.json kept on the VPS
#                (dist.prev/) and restart.
#
# Optional env:
#   AGENTS_SSH_HOST=lemodesign            — VPS running backsteros-agents.service
#   REMOTE_AGENTS_DIR=/srv/backsteros/agents
#   AGENTS_SERVICE=backsteros-agents
#   AGENTS_USER=backsteros-agents
#   SKIP_DEPLOY_CHECK=1                   — skip `deploy:check --only=agents`
#
# Layout and unit: agents/README.md → "Deploy on the VPS". The VPS .env
# (CORE_UPSTREAM_URL, PORT, LISTEN_HOST) is never touched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

AGENTS_SSH_HOST="${AGENTS_SSH_HOST:-lemodesign}"
REMOTE_AGENTS_DIR="${REMOTE_AGENTS_DIR:-/srv/backsteros/agents}"
AGENTS_SERVICE="${AGENTS_SERVICE:-backsteros-agents}"
AGENTS_USER="${AGENTS_USER:-backsteros-agents}"

ROLLBACK=0
for arg in "$@"; do
  case "$arg" in
    --rollback) ROLLBACK=1 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "error: unknown argument: $arg" >&2; exit 2 ;;
  esac
done

remote_health() {
  # The door binds LISTEN_HOST:PORT from its .env (172.18.0.1 on lemodesign so Caddy can reach it).
  local bind
  bind="$(ssh "$AGENTS_SSH_HOST" "sudo awk -F= '/^LISTEN_HOST=/{h=\$2} /^PORT=/{p=\$2} END{print (h?h:\"127.0.0.1\") \":\" (p?p:3080)}' '${REMOTE_AGENTS_DIR}/.env'")"
  echo "==> Waiting for ${AGENTS_SERVICE} /health on ${bind}…"
  for i in $(seq 1 20); do
    if HEALTH="$(ssh "$AGENTS_SSH_HOST" "curl -sf --max-time 3 http://${bind}/health")"; then
      echo "    OK: ${HEALTH}"
      return 0
    fi
    if [[ "$i" -eq 20 ]]; then
      echo "error: agents door not healthy after 20s — check: ssh ${AGENTS_SSH_HOST} sudo journalctl -u ${AGENTS_SERVICE} -n 50" >&2
      exit 1
    fi
    sleep 1
  done
}

echo "==> Target: ${AGENTS_SSH_HOST}:${REMOTE_AGENTS_DIR}"

if [[ "$ROLLBACK" == "1" ]]; then
  ssh "$AGENTS_SSH_HOST" "sudo bash -s -- '${REMOTE_AGENTS_DIR}' '${AGENTS_SERVICE}'" <<'REMOTE'
set -euo pipefail
DIR="$1"
SERVICE="$2"
if [[ ! -d "$DIR/dist.prev" ]]; then
  echo "error: no $DIR/dist.prev to roll back to" >&2
  exit 1
fi
rm -rf "$DIR/dist.failed"
mv "$DIR/dist" "$DIR/dist.failed"
mv "$DIR/dist.prev" "$DIR/dist"
if [[ -f "$DIR/build-info.prev.json" ]]; then mv "$DIR/build-info.prev.json" "$DIR/build-info.json"; fi
systemctl restart "$SERVICE"
REMOTE
  remote_health
  echo "==> Rollback complete."
  exit 0
fi

COMMIT="$(git rev-parse HEAD)"
BUILT_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
DIRTY=false
if [[ -n "$(git status --porcelain -- agents 2>/dev/null || true)" ]]; then
  DIRTY=true
  echo "WARN: agents/ has uncommitted changes — /health will report dirty=true."
fi

echo "==> Building agents (tsc)…"
rm -rf agents/dist
pnpm --filter @backsteros/agents build

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/dist"
rsync -a --exclude '*.test.js' agents/dist/ "$STAGE/dist/"
cp agents/package.json "$STAGE/package.json"
cat >"$STAGE/build-info.json" <<JSON
{
  "commit": "${COMMIT}",
  "builtAt": "${BUILT_AT}",
  "dirty": ${DIRTY}
}
JSON

REMOTE_STAGE="/tmp/backsteros-agents-${COMMIT:0:12}"
echo "==> Uploading to ${AGENTS_SSH_HOST}:${REMOTE_STAGE}…"
ssh "$AGENTS_SSH_HOST" "rm -rf '${REMOTE_STAGE}' && mkdir -p '${REMOTE_STAGE}'"
rsync -az --delete "$STAGE/" "${AGENTS_SSH_HOST}:${REMOTE_STAGE}/"

echo "==> Installing and restarting ${AGENTS_SERVICE}…"
ssh "$AGENTS_SSH_HOST" "sudo bash -s -- '${REMOTE_AGENTS_DIR}' '${AGENTS_SERVICE}' '${AGENTS_USER}' '${REMOTE_STAGE}'" <<'REMOTE'
set -euo pipefail
DIR="$1"
SERVICE="$2"
OWNER="$3"
STAGE="$4"

rm -rf "$DIR/dist.prev"
if [[ -d "$DIR/dist" ]]; then cp -a "$DIR/dist" "$DIR/dist.prev"; fi
if [[ -f "$DIR/build-info.json" ]]; then cp -a "$DIR/build-info.json" "$DIR/build-info.prev.json"; fi

DEPS_CHANGED=1
if [[ -f "$DIR/package.json" ]] && cmp -s "$STAGE/package.json" "$DIR/package.json"; then
  DEPS_CHANGED=0
fi

rsync -a --delete "$STAGE/dist/" "$DIR/dist/"
install -m 0644 "$STAGE/package.json" "$DIR/package.json"
install -m 0644 "$STAGE/build-info.json" "$DIR/build-info.json"
chown -R "$OWNER:$OWNER" "$DIR/dist" "$DIR/package.json" "$DIR/build-info.json"

if [[ "$DEPS_CHANGED" == "1" ]]; then
  echo "    package.json changed — npm install --omit=dev"
  sudo -u "$OWNER" -H bash -c "cd '$DIR' && npm install --omit=dev --no-audit --no-fund"
fi

systemctl restart "$SERVICE"
rm -rf "$STAGE"
REMOTE

remote_health

if [[ "${SKIP_DEPLOY_CHECK:-0}" != "1" ]]; then
  echo "==> deploy:check (agents)…"
  node scripts/deploy-check.mjs --only=agents
fi

echo "==> Agents deploy complete (${COMMIT:0:12}). Roll back with: $0 --rollback"
