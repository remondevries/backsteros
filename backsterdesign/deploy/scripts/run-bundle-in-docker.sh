#!/usr/bin/env bash
# Detached Penpot module release build that survives the parent shell exiting.
# Usage: ./run-bundle-in-docker.sh <frontend|backend|exporter|mcp> [version]

set -euo pipefail

MOD="${1:?module}"
VERSION="${2:-2.18.3}"
DESIGN_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NAME="bd-build-${MOD}"
IMG="${DEVENV_IMGNAME:-penpotapp/devenv}:${DEVENV_TAG:-latest}"
VOL="${PENPOT_USER_DATA_VOLUME:-penpotdev_user_data}"
UID_NUM="$(id -u)"

cd "$DESIGN_ROOT"
docker volume create "$VOL" >/dev/null
docker rm -f "$NAME" >/dev/null 2>&1 || true

docker run -d --name "$NAME" \
  --mount "source=${VOL},type=volume,target=/home/penpot/" \
  --mount "source=${DESIGN_ROOT},type=bind,target=/home/penpot/penpot" \
  -e "EXTERNAL_UID=${UID_NUM}" \
  -e "JAVA_OPTS=${JAVA_OPTS:--Xmx2000m -Xms50m}" \
  -e "PENPOT_BUILD_VERSION=${VERSION}" \
  -e "NODE_ENV=production" \
  -w "/home/penpot/penpot/${MOD}" \
  "$IMG" \
  sudo -EH -u penpot "./scripts/build" "$VERSION"

echo "started $NAME"
echo "follow: docker logs -f $NAME"
echo "wait:   docker wait $NAME"
