#!/usr/bin/env bash
# Build, ship, and restart cloud-core on the backsteros VPS, then run migrations
# and the CRM hybrid proof against local-core.
#
# Run from repo root on your Mac (needs Docker, SSH to server, 1Password SSH for git deps):
#   ./deploy/cloud/deploy-cloud-core.sh [--powersync] [--rollback=<image-tag>]
#
#   --powersync          after migrating, copy deploy/powersync/sync-config.yaml and
#                        the render script to the VPS, re-run powersync-setup from the
#                        new image, re-render the service config, restart PowerSync
#                        and probe it (README → "PowerSync → Enable or repair").
#   --rollback=<tag>     retag an image already on the VPS (e.g. 9651125261b6) as
#                        :latest and restart. No build, no migrations; schema stays.
#
# Optional env:
#   CLOUD_SSH_HOST=lemodesign   — live cloud-core host (default). Do NOT use
#                                 ssh production / hetzner (46.225.171.3) — that
#                                 box has no cloud-core compose.
#   REMOTE_COMPOSE_DIR=/root/backsteros/deploy/cloud
#   SKIP_PROOF=1          — skip prove-crm-powersync-leader after deploy
#   SKIP_BUILD=1          — reuse existing backsteros-cloud:latest image
#   SKIP_DEPLOY_CHECK=1   — skip `pnpm deploy:check --only=cloud` at the end
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

POWERSYNC=0
ROLLBACK_TAG=""
for arg in "$@"; do
  case "$arg" in
    --powersync) POWERSYNC=1 ;;
    --rollback=*) ROLLBACK_TAG="${arg#--rollback=}" ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "error: unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# Live cloud-core runs on lemodesign (188.34.196.92 / Tailscale 100.83.125.67).
CLOUD_SSH_HOST="${CLOUD_SSH_HOST:-lemodesign}"
# Compose lives under root's clone; deploy user has passwordless sudo.
REMOTE_COMPOSE_DIR="${REMOTE_COMPOSE_DIR:-/root/backsteros/deploy/cloud}"
REMOTE_DEPLOY_DIR="$(dirname "$REMOTE_COMPOSE_DIR")"
REMOTE_COMPOSE="sudo docker compose -f ${REMOTE_COMPOSE_DIR}/docker-compose.yml --project-directory ${REMOTE_COMPOSE_DIR}"

echo "==> Target: ${CLOUD_SSH_HOST}"
if [[ "${CLOUD_SSH_HOST}" == "hetzner" || "${CLOUD_SSH_HOST}" == "production" || "${CLOUD_SSH_HOST}" == "46.225.171.3" ]]; then
  echo "error: ${CLOUD_SSH_HOST} is the Kamal/build VPS — cloud-core lives on lemodesign." >&2
  echo "  Use: CLOUD_SSH_HOST=lemodesign ./deploy/cloud/deploy-cloud-core.sh" >&2
  exit 1
fi

# Health is on the server itself — use Tailscale peer URL from local .env if set.
LOCAL_PEER="$(grep '^CORE_REPLICATION_PEER_URL=' core/server/.env 2>/dev/null | cut -d= -f2- || true)"
# Fallback: lemodesign over Tailscale (cloud-core moved off production in OS-118).
CLOUD_CORE_URL="${CLOUD_CORE_URL:-http://100.83.125.67:8788}"
CLOUD_BASE="${LOCAL_PEER:-$CLOUD_CORE_URL}"
CLOUD_BASE="${CLOUD_BASE%/}"

wait_for_health() {
  echo "==> Waiting for /health…"
  for i in $(seq 1 30); do
    if curl -sf --max-time 3 "${CLOUD_BASE}/health" >/dev/null 2>&1; then
      echo "    OK: ${CLOUD_BASE}/health"
      return 0
    fi
    if [[ "$i" -eq 30 ]]; then
      echo "WARN: cloud /health not ready after 30s (${CLOUD_BASE}/health)"
    fi
    sleep 1
  done
}

if [[ -n "$ROLLBACK_TAG" ]]; then
  echo "==> Rolling back to backsteros-cloud:${ROLLBACK_TAG}…"
  ssh "$CLOUD_SSH_HOST" "docker image inspect backsteros-cloud:${ROLLBACK_TAG} >/dev/null && docker tag backsteros-cloud:${ROLLBACK_TAG} backsteros-cloud:latest"
  ssh "$CLOUD_SSH_HOST" "${REMOTE_COMPOSE} up -d --no-build backsteros"
  wait_for_health
  echo "==> Rollback complete. Migrations were not reverted; deploy:check will report the older commit."
  exit 0
fi

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> Building backsteros-cloud:latest (linux/amd64)…"
  if [[ -z "${SSH_AUTH_SOCK:-}" ]]; then
    echo "WARN: SSH_AUTH_SOCK unset — git SSH deps (@briangaoo/totem) may fail during docker build."
    echo "      Ensure 1Password SSH agent is enabled or ssh-agent has GitHub access."
  fi
  ./deploy/cloud/build-image.sh
else
  echo "==> Skipping image build (SKIP_BUILD=1)"
fi

IMAGE_COMMIT="$(docker image inspect backsteros-cloud:latest --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^BACKSTEROS_BUILD_COMMIT=//p')"
IMAGE_DIRTY="$(docker image inspect backsteros-cloud:latest --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^BACKSTEROS_BUILD_DIRTY=//p')"
IMAGE_TAG="${IMAGE_COMMIT:0:12}"
[[ "$IMAGE_DIRTY" == "1" ]] && IMAGE_TAG="${IMAGE_TAG}-dirty"
docker tag backsteros-cloud:latest "backsteros-cloud:${IMAGE_TAG}"

echo "==> Loading backsteros-cloud:${IMAGE_TAG} on ${CLOUD_SSH_HOST}…"
docker save backsteros-cloud:latest "backsteros-cloud:${IMAGE_TAG}" | ssh "$CLOUD_SSH_HOST" 'docker load'

echo "==> Restarting cloud-core container…"
ssh "$CLOUD_SSH_HOST" "${REMOTE_COMPOSE} up -d --no-build backsteros"

wait_for_health

echo "==> Running db:migrate in container…"
# Compose injects DATABASE_URL; the image has no .env (pnpm db:migrate uses --env-file=.env).
ssh "$CLOUD_SSH_HOST" "${REMOTE_COMPOSE} exec -T backsteros sh -c 'cd /app/core/server && pnpm exec tsx src/db/migrate.ts'"

if [[ "$POWERSYNC" == "1" ]]; then
  echo "==> PowerSync: copying sync rules and render script…"
  ssh "$CLOUD_SSH_HOST" "sudo tee ${REMOTE_DEPLOY_DIR}/powersync/sync-config.yaml >/dev/null" <deploy/powersync/sync-config.yaml
  ssh "$CLOUD_SSH_HOST" "sudo tee ${REMOTE_COMPOSE_DIR}/render-powersync-config.mjs >/dev/null" <deploy/cloud/render-powersync-config.mjs

  echo "==> PowerSync: role, grants and publication (powersync-setup from the new image)…"
  # The password is read on the VPS and never echoed.
  ssh "$CLOUD_SSH_HOST" "sudo bash -s -- '${REMOTE_COMPOSE_DIR}'" <<'REMOTE'
set -euo pipefail
DIR="$1"
PW="$(awk -F= '/^POWERSYNC_DB_PASSWORD=/{print substr($0,index($0,"=")+1)}' "$DIR/.env")"
if [[ -z "$PW" ]]; then
  echo "error: POWERSYNC_DB_PASSWORD missing in $DIR/.env" >&2
  exit 1
fi
docker compose -f "$DIR/docker-compose.yml" --project-directory "$DIR" \
  exec -T -e POWERSYNC_DB_PASSWORD="$PW" -w /app/core/server backsteros pnpm exec tsx src/db/powersync-setup.ts
set -a
# shellcheck disable=SC1091
source "$DIR/.env"
set +a
node "$DIR/render-powersync-config.mjs"
REMOTE

  echo "==> PowerSync: restarting profile…"
  ssh "$CLOUD_SSH_HOST" "${REMOTE_COMPOSE} --profile powersync up -d && ${REMOTE_COMPOSE} --profile powersync restart powersync"

  echo "==> PowerSync: probing liveness…"
  for i in $(seq 1 30); do
    if ssh "$CLOUD_SSH_HOST" "curl -sf --max-time 3 http://127.0.0.1:8080/probes/liveness >/dev/null"; then
      echo "    OK: PowerSync live"
      break
    fi
    if [[ "$i" -eq 30 ]]; then
      echo "error: PowerSync liveness failed after 60s — check: ${REMOTE_COMPOSE} logs powersync" >&2
      exit 1
    fi
    sleep 2
  done
fi

echo "==> Verifying cloud replication knows crm_groups…"
SECRET="$(grep '^CORE_REPLICATION_SECRET=' core/server/.env | cut -d= -f2-)"
CHANGES="$(curl -sf --max-time 15 \
  "${CLOUD_BASE}/internal/core-replication/changes?table=crm_groups&since=1970-01-01T00:00:00.000Z&since_id=" \
  -H "Authorization: Bearer ${SECRET}" || true)"
if echo "$CHANGES" | grep -q '"table":"crm_groups"'; then
  echo "    OK: crm_groups replication endpoint live on cloud"
else
  echo "    WARN: crm_groups still missing on cloud — response: ${CHANGES:-<empty>}"
fi

if [[ "${SKIP_PROOF:-0}" != "1" ]]; then
  echo "==> Running CRM PowerSync leader proof from local-core…"
  (cd core/server && pnpm prove:crm-powersync-leader)
fi

if [[ "${SKIP_DEPLOY_CHECK:-0}" != "1" ]]; then
  echo "==> deploy:check (cloud)…"
  CLOUD_CORE_URL="$CLOUD_BASE" node scripts/deploy-check.mjs --only=cloud
fi

echo "==> Deploy complete (backsteros-cloud:${IMAGE_TAG}). Roll back with: $0 --rollback=<previous-tag>"
