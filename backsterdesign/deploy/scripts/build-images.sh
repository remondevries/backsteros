#!/usr/bin/env bash
# Build BacksterDESIGN release images from the vendored Penpot fork.
#
# Prefers the running devenv container (`penpot-devenv-ws0-main`) so we reuse
# the same toolchain as day-to-day fork work. Falls back to `manage.sh build`
# (fresh docker run) when that container is not up.
#
# Usage (from repo root or backsterdesign/):
#   IMAGE_TAG=2.18.3 ./backsterdesign/deploy/scripts/build-images.sh
#   IMAGE_TAG=2.18.3 ./backsterdesign/deploy/scripts/build-images.sh --skip-bundle

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESIGN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
IMAGE_TAG="${IMAGE_TAG:-2.18.3}"
IMAGE_NS="${IMAGE_NS:-backsterdesign}"
DEVENV_CONTAINER="${DEVENV_CONTAINER:-penpot-devenv-ws0-main}"
SKIP_BUNDLE=0

for arg in "$@"; do
  case "$arg" in
    --skip-bundle) SKIP_BUNDLE=1 ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

cd "$DESIGN_ROOT"

if [[ ! -x ./manage.sh ]]; then
  echo "manage.sh not found in $DESIGN_ROOT" >&2
  exit 1
fi

export PENPOT_BUILD_VERSION="${PENPOT_BUILD_VERSION:-$IMAGE_TAG}"
MANAGE=(bash ./manage.sh)

devenv_running() {
  docker inspect -f '{{.State.Running}}' "$DEVENV_CONTAINER" 2>/dev/null | grep -q true
}

clear_bind_mount_junk() {
  # macOS bind mounts often leave node_modules that `rm -rf` as penpot cannot
  # fully delete (partial .pnpm trees). Wipe as root inside the container.
  if devenv_running; then
    echo "==> Clearing frontend/mcp node_modules + prior dist (root in devenv)…"
    docker exec "$DEVENV_CONTAINER" bash -lc \
      "rm -rf /home/penpot/penpot/frontend/node_modules \
              /home/penpot/penpot/mcp/node_modules \
              /home/penpot/penpot/frontend/target \
              /home/penpot/penpot/mcp/dist \
              /home/penpot/penpot/backend/target \
              /home/penpot/penpot/exporter/target"
  fi
  rm -rf \
    "$DESIGN_ROOT/frontend/node_modules" \
    "$DESIGN_ROOT/mcp/node_modules" \
    "$DESIGN_ROOT/frontend/target" \
    "$DESIGN_ROOT/mcp/dist" \
    "$DESIGN_ROOT/backend/target" \
    "$DESIGN_ROOT/exporter/target" \
    2>/dev/null || true
}

build_in_devenv() {
  local mod="$1"
  local script="${2:-build}"
  echo "==> devenv: ${mod}/scripts/${script} ${PENPOT_BUILD_VERSION}"
  docker exec -u penpot \
    -e NODE_ENV=production \
    -e JAVA_OPTS="${JAVA_OPTS:--Xmx2000m -Xms50m}" \
    -w "/home/penpot/penpot/${mod}" \
    "$DEVENV_CONTAINER" \
    bash -lc "./scripts/${script} ${PENPOT_BUILD_VERSION}"
}

stage_bundle() {
  local mod="$1"
  local src="$2"
  local dest="./bundles/${mod}"
  mkdir -p ./bundles
  rm -rf "$dest"
  mv "$src" "$dest"
  echo "$PENPOT_BUILD_VERSION" > "$dest/version.txt"
  cat >> "$dest/LICENSE" <<'EOF'
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at http://mozilla.org/MPL/2.0/.

Copyright (c) KALEIDOS INC Sucursal en España SL
EOF
  echo "==> staged $dest"
}

if [[ "$SKIP_BUNDLE" -eq 0 ]]; then
  echo "==> Building release bundles (PENPOT_BUILD_VERSION=$PENPOT_BUILD_VERSION)"
  echo "    Using manage.sh fresh docker run (does not share the live devenv watch)."
  clear_bind_mount_junk
  # Fresh container per module — avoids racing the live shadow-cljs / storybook
  # watches inside penpot-devenv-ws0-main.
  "${MANAGE[@]}" build-frontend-bundle
  "${MANAGE[@]}" build-backend-bundle
  "${MANAGE[@]}" build-exporter-bundle
  "${MANAGE[@]}" build-mcp-bundle
else
  echo "==> Skipping bundle build (--skip-bundle)"
  for d in frontend backend exporter mcp; do
    if [[ ! -d "./bundles/$d" ]]; then
      echo "missing ./bundles/$d — run without --skip-bundle first" >&2
      exit 1
    fi
  done
fi

# lemodesign is linux/amd64; Mac builds must target that platform.
export DOCKER_DEFAULT_PLATFORM="${DOCKER_DEFAULT_PLATFORM:-linux/amd64}"
echo "==> Packaging Docker images as penpotapp/*:${IMAGE_TAG} (platform=${DOCKER_DEFAULT_PLATFORM})…"
"${MANAGE[@]}" build-frontend-docker-image --tag "$IMAGE_TAG"
"${MANAGE[@]}" build-backend-docker-image --tag "$IMAGE_TAG"
"${MANAGE[@]}" build-exporter-docker-image --tag "$IMAGE_TAG"
"${MANAGE[@]}" build-mcp-docker-image --tag "$IMAGE_TAG"

echo "==> Retagging to ${IMAGE_NS}/*:${IMAGE_TAG}…"
for image in frontend backend exporter mcp; do
  docker tag "penpotapp/${image}:${IMAGE_TAG}" "${IMAGE_NS}/${image}:${IMAGE_TAG}"
  docker tag "${IMAGE_NS}/${image}:${IMAGE_TAG}" "${IMAGE_NS}/${image}:latest"
done

echo "==> Done. Local images:"
docker images --format 'table {{.Repository}}:{{.Tag}}\t{{.Size}}' | grep "^${IMAGE_NS}/" || true
echo
echo "Next: IMAGE_TAG=${IMAGE_TAG} ./deploy/scripts/deploy-lemodesign.sh"
