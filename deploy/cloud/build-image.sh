#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export DOCKER_BUILDKIT=1

COMMIT="$(git rev-parse HEAD)"
BUILT_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
DIRTY=false
if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
  DIRTY=true
fi

mkdir -p core/server
cat >core/server/build-info.json <<JSON
{
  "commit": "${COMMIT}",
  "builtAt": "${BUILT_AT}",
  "dirty": ${DIRTY}
}
JSON

# Sha tag (12 chars, `-dirty` for uncommitted trees) so a deploy can roll back:
#   ./deploy/cloud/deploy-cloud-core.sh --rollback=<tag>
IMAGE_TAG="${COMMIT:0:12}"
if [[ "${DIRTY}" == true ]]; then
  IMAGE_TAG="${IMAGE_TAG}-dirty"
fi

docker buildx build \
  --platform linux/amd64 \
  -f deploy/cloud/Dockerfile \
  -t backsteros-cloud:latest \
  -t "backsteros-cloud:${IMAGE_TAG}" \
  --build-arg BACKSTEROS_BUILD_COMMIT="${COMMIT}" \
  --build-arg BACKSTEROS_BUILD_BUILT_AT="${BUILT_AT}" \
  --build-arg BACKSTEROS_BUILD_DIRTY="$([[ "${DIRTY}" == true ]] && echo 1 || echo 0)" \
  --load \
  .

echo "Built backsteros-cloud:latest + backsteros-cloud:${IMAGE_TAG} (linux/amd64) commit=${COMMIT}"
echo "After deploy, refresh the Mac replica: bash scripts/local-core/update-build.sh && bash scripts/local-core/install-launch-agent.sh"
