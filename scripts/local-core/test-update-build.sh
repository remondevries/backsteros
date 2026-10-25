#!/usr/bin/env bash
# Scratch-dir check for OS-61 update-build + runtime publish (does not touch
# ~/.backsteros/local-core-build, ~/.backsteros/local-core-runtime, or the live
# :8788 LaunchAgent).
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
export BACKSTEROS_LOCAL_CORE_RUNTIME="${SCRATCH}/runtime"
export BACKSTEROS_LOCAL_CORE_BUILD_BRANCH="os-61-scratch-$$"

echo "scratch build → ${BACKSTEROS_LOCAL_CORE_BUILD}"
echo "scratch runtime → ${BACKSTEROS_LOCAL_CORE_RUNTIME}"
bash "${ROOT}/scripts/local-core/update-build.sh"

test -f "${BACKSTEROS_LOCAL_CORE_BUILD}/pnpm-workspace.yaml"
test -f "${BACKSTEROS_LOCAL_CORE_BUILD}/docker-compose.yml"
test -f "${BACKSTEROS_LOCAL_CORE_BUILD}/core/server/build-info.json"
test -d "${BACKSTEROS_LOCAL_CORE_BUILD}/core/packages/contracts/dist"

CURRENT="${BACKSTEROS_LOCAL_CORE_RUNTIME}/current"
test -f "${BACKSTEROS_LOCAL_CORE_RUNTIME}/DO_NOT_DELETE"
test -f "${CURRENT}/scripts/local-core/run.sh"
test -f "${CURRENT}/core/server/build-info.json"
test -d "${CURRENT}/node_modules"
test -f "${CURRENT}/docker-compose.yml"
test ! -e "${CURRENT}/.git"

COMMIT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["commit"])' "${CURRENT}/core/server/build-info.json")"
DIRTY="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["dirty"])' "${CURRENT}/core/server/build-info.json")"
EXPECTED="$(git -C "${ROOT}" rev-parse origin/production)"
test "${COMMIT}" = "${EXPECTED}"
test "${DIRTY}" = "False" -o "${DIRTY}" = "false"

# lib.sh prefers the published runtime over the build worktree.
RESOLVED="$(
  BACKSTEROS_LOCAL_CORE_BUILD="${BACKSTEROS_LOCAL_CORE_BUILD}" \
  BACKSTEROS_LOCAL_CORE_RUNTIME="${BACKSTEROS_LOCAL_CORE_RUNTIME}" \
  bash -c '
    SCRIPT_DIR="'"${ROOT}"'/scripts/local-core"
    # shellcheck source=/dev/null
    source "${SCRIPT_DIR}/lib.sh"
    local_core_resolve_repo_root || exit 1
    printf "%s\n" "${REPO_ROOT}"
  '
)"
test "${RESOLVED}" = "${CURRENT}"

# Sentinel parent must not be rm -rf'd without force + staging complete.
set +e
BACKSTEROS_LOCAL_CORE_RUNTIME="${BACKSTEROS_LOCAL_CORE_RUNTIME}" \
bash -c '
  SCRIPT_DIR="'"${ROOT}"'/scripts/local-core"
  source "${SCRIPT_DIR}/lib.sh"
  local_core_safe_rm_rf "'"${BACKSTEROS_LOCAL_CORE_RUNTIME}"'"
'
SAFE_STATUS=$?
set -e
test "${SAFE_STATUS}" -ne 0
test -f "${BACKSTEROS_LOCAL_CORE_RUNTIME}/DO_NOT_DELETE"

echo "OS-61 update-build ok (commit=${COMMIT:0:12} runtime=${CURRENT})"
