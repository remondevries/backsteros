#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export DOCKER_BUILDKIT=1

docker buildx build \
  --platform linux/amd64 \
  -f deploy/cloud/Dockerfile \
  -t backsteros-cloud:latest \
  --load \
  .

echo "Built backsteros-cloud:latest (linux/amd64)"
