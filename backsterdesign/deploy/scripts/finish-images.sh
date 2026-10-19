#!/usr/bin/env bash
# Finish remaining bundles (backend/exporter/mcp), package Docker images.
# Assumes frontend is already staged in bundles/frontend.
# Detaches from the launching terminal via setsid when invoked that way.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESIGN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
IMAGE_TAG="${IMAGE_TAG:-2.18.3}"
IMAGE_NS="${IMAGE_NS:-backsterdesign}"
LOG="${LOG:-/tmp/backsterdesign-finish-images.log}"

cd "$DESIGN_ROOT"
exec >>"$LOG" 2>&1

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) finish-images start ==="
export PENPOT_BUILD_VERSION="${PENPOT_BUILD_VERSION:-$IMAGE_TAG}"

stage_bundle() {
  local mod="$1" src="$2"
  mkdir -p ./bundles
  rm -rf "./bundles/${mod}"
  mv "$src" "./bundles/${mod}"
  echo "$PENPOT_BUILD_VERSION" > "./bundles/${mod}/version.txt"
  echo "staged bundles/${mod} ($(du -sh "./bundles/${mod}" | awk '{print $1}'))"
}

run_mod() {
  local mod="$1"
  if [[ -d "./bundles/${mod}" ]]; then
    echo "==> skip ${mod} (bundles/${mod} already present)"
    return 0
  fi
  echo "==> build ${mod}"
  bash "$SCRIPT_DIR/run-bundle-in-docker.sh" "$mod" "$PENPOT_BUILD_VERSION"
  local name="bd-build-${mod}"
  local code
  code="$(docker wait "$name")"
  docker logs "$name" | tail -40
  docker rm -f "$name" >/dev/null 2>&1 || true
  if [[ "$code" != "0" ]]; then
    echo "ERROR: ${mod} build exited $code" >&2
    exit "$code"
  fi
  case "$mod" in
    frontend) stage_bundle frontend ./frontend/target/dist ;;
    backend)  stage_bundle backend ./backend/target/dist ;;
    exporter) stage_bundle exporter ./exporter/target ;;
    mcp)      stage_bundle mcp ./mcp/dist ;;
  esac
}

if [[ ! -d ./bundles/frontend ]]; then
  echo "ERROR: bundles/frontend missing — stage frontend first" >&2
  exit 1
fi

run_mod backend
run_mod exporter
run_mod mcp

echo "==> package docker images (linux/amd64 for lemodesign)"
export DOCKER_DEFAULT_PLATFORM="${DOCKER_DEFAULT_PLATFORM:-linux/amd64}"
bash ./manage.sh build-frontend-docker-image --tag "$IMAGE_TAG"
bash ./manage.sh build-backend-docker-image --tag "$IMAGE_TAG"
bash ./manage.sh build-exporter-docker-image --tag "$IMAGE_TAG"
bash ./manage.sh build-mcp-docker-image --tag "$IMAGE_TAG"

for image in frontend backend exporter mcp; do
  docker tag "penpotapp/${image}:${IMAGE_TAG}" "${IMAGE_NS}/${image}:${IMAGE_TAG}"
  docker tag "${IMAGE_NS}/${image}:${IMAGE_TAG}" "${IMAGE_NS}/${image}:latest"
done

echo "==> images:"
docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep "^${IMAGE_NS}/" || true
echo "EXIT:0"
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) finish-images done ==="
