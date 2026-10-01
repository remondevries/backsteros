#!/usr/bin/env bash
# Scratch-dir check for OS-61 update-build (does not touch
# ~/.backsteros/local-core-build or the live :8788 LaunchAgent).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/os-61-local-core-build.XXXXXX")"
cleanup() {
  if [[ -d "${SCRATCH}/build" ]]; then
    git -C "${ROOT}" worktree remove --force "${SCRATCH}/build" 2>/dev/null || true
  fi
  rm -rf "${SCRATCH}"
}
trap cleanup EXIT

export BACKSTEROS_LOCAL_CORE_BUILD="${SCRATCH}/build"
export BACKSTEROS_LOCAL_CORE_BUILD_BRANCH="os-61-scratch-$$"

echo "scratch build → ${BACKSTEROS_LOCAL_CORE_BUILD}"
bash "${ROOT}/scripts/local-core/update-build.sh"

test -f "${BACKSTEROS_LOCAL_CORE_BUILD}/pnpm-workspace.yaml"
test -f "${BACKSTEROS_LOCAL_CORE_BUILD}/docker-compose.yml"
test -f "${BACKSTEROS_LOCAL_CORE_BUILD}/core/server/build-info.json"
test -d "${BACKSTEROS_LOCAL_CORE_BUILD}/core/packages/contracts/dist"

COMMIT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["commit"])' "${BACKSTEROS_LOCAL_CORE_BUILD}/core/server/build-info.json")"
DIRTY="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["dirty"])' "${BACKSTEROS_LOCAL_CORE_BUILD}/core/server/build-info.json")"
EXPECTED="$(git -C "${ROOT}" rev-parse origin/production)"
test "${COMMIT}" = "${EXPECTED}"
test "${DIRTY}" = "False" -o "${DIRTY}" = "false"

# run.sh prefers the dedicated build when BACKSTEROS_LOCAL_CORE_BUILD is set.
# Probe resolve by running a tiny bash snippet that mirrors resolve_repo_root.
RESOLVED="$(
  LOCAL_CORE_BUILD="${BACKSTEROS_LOCAL_CORE_BUILD}" \
  REPO_ROOT="" \
  bash -c '
    LOCAL_CORE_BUILD="${LOCAL_CORE_BUILD}"
    REPO_ROOT=""
    if [[ -n "${LOCAL_CORE_BUILD}" \
      && -f "${LOCAL_CORE_BUILD}/pnpm-workspace.yaml" \
      && -f "${LOCAL_CORE_BUILD}/docker-compose.yml" \
      && -d "${LOCAL_CORE_BUILD}/core/server" ]]; then
      printf "%s\n" "${LOCAL_CORE_BUILD}"
      exit 0
    fi
    exit 1
  '
)"
test "${RESOLVED}" = "${BACKSTEROS_LOCAL_CORE_BUILD}"

echo "OS-61 update-build ok (commit=${COMMIT:0:12})"
