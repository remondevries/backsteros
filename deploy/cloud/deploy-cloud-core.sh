#!/usr/bin/env bash
# Build, ship, and restart cloud-core on the backsteros VPS, then run migrations
# and the CRM hybrid proof against local-core.
#
# Run from repo root on your Mac (needs Docker, SSH to server, 1Password SSH for git deps):
#   ./deploy/cloud/deploy-cloud-core.sh
#
# Optional env:
#   CLOUD_SSH_HOST=backsteros.com          — default; see ~/.ssh/config (sudo user, not root)
#   REMOTE_COMPOSE_DIR=/root/backsteros/deploy/cloud
#   SKIP_PROOF=1          — skip prove-crm-powersync-leader after deploy
#   SKIP_BUILD=1          — reuse existing backsteros-cloud:latest image
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

CLOUD_SSH_HOST="${CLOUD_SSH_HOST:-hetzner}"
# Compose lives under root's clone; deploy user has passwordless sudo.
REMOTE_COMPOSE_DIR="${REMOTE_COMPOSE_DIR:-/root/backsteros/deploy/cloud}"
REMOTE_COMPOSE="sudo docker compose -f ${REMOTE_COMPOSE_DIR}/docker-compose.yml --project-directory ${REMOTE_COMPOSE_DIR}"

echo "==> Target: ${CLOUD_SSH_HOST}"

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

echo "==> Loading image on ${CLOUD_SSH_HOST}…"
docker save backsteros-cloud:latest | ssh "$CLOUD_SSH_HOST" 'docker load'

echo "==> Restarting cloud-core container…"
ssh "$CLOUD_SSH_HOST" "${REMOTE_COMPOSE} up -d --no-build backsteros"

echo "==> Waiting for /health…"
# Health is on the server itself — use Tailscale peer URL from local .env if set.
LOCAL_PEER="$(grep '^CORE_REPLICATION_PEER_URL=' core/server/.env 2>/dev/null | cut -d= -f2- || true)"
HEALTH_URL="${LOCAL_PEER:-http://100.75.45.22:8788}"
HEALTH_URL="${HEALTH_URL%/}/health"
for i in $(seq 1 30); do
  if curl -sf --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "    OK: ${HEALTH_URL}"
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "WARN: cloud /health not ready after 30s (${HEALTH_URL})"
  fi
  sleep 1
done

echo "==> Running db:migrate in container…"
ssh "$CLOUD_SSH_HOST" "${REMOTE_COMPOSE} exec -T backsteros pnpm db:migrate"

echo "==> Verifying cloud replication knows crm_groups…"
SECRET="$(grep '^CORE_REPLICATION_SECRET=' core/server/.env | cut -d= -f2-)"
CLOUD_BASE="${LOCAL_PEER:-http://100.75.45.22:8788}"
CLOUD_BASE="${CLOUD_BASE%/}"
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

echo "==> Deploy complete."
