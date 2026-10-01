#!/usr/bin/env bash
# Update the dedicated local-core build worktree to origin/production.
#
# Default path: ~/.backsteros/local-core-build
# Override with BACKSTEROS_LOCAL_CORE_BUILD (use a scratch dir when testing —
# do not point Remon's live LaunchAgent at an unfinished tree).
#
# After a cloud-core deploy, run this then restart the local-core LaunchAgent
# so the replica serves the same commit as cloud.
set -euo pipefail

LABEL="local-core-build"
BUILD_DIR="${BACKSTEROS_LOCAL_CORE_BUILD:-${HOME}/.backsteros/local-core-build}"
BRANCH_NAME="${BACKSTEROS_LOCAL_CORE_BUILD_BRANCH:-local-core-build}"
SOURCE_REF="${BACKSTEROS_LOCAL_CORE_REF:-origin/production}"

log() {
  printf '%s [%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "${LABEL}" "$*" >&2
}

resolve_git_common() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  if git -C "${here}" rev-parse --git-common-dir >/dev/null 2>&1; then
    printf '%s\n' "${here}"
    return 0
  fi
  if [[ -d "${HOME}/BacksterOS/Projects/OS/Codebase/.git" ]] \
    || git -C "${HOME}/BacksterOS/Projects/OS/Codebase" rev-parse --git-common-dir >/dev/null 2>&1; then
    printf '%s\n' "${HOME}/BacksterOS/Projects/OS/Codebase"
    return 0
  fi
  return 1
}

MAIN_REPO="$(resolve_git_common)" || {
  log "could not find the BacksterOS git common directory"
  exit 1
}

log "fetching production (cwd=${MAIN_REPO})"
git -C "${MAIN_REPO}" fetch origin production

if ! git -C "${MAIN_REPO}" rev-parse --verify "${SOURCE_REF}" >/dev/null 2>&1; then
  log "missing ref ${SOURCE_REF} after fetch"
  exit 1
fi

TARGET_SHA="$(git -C "${MAIN_REPO}" rev-parse "${SOURCE_REF}")"
BUILT_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

if [[ -d "${BUILD_DIR}/.git" ]] || git -C "${BUILD_DIR}" rev-parse --git-dir >/dev/null 2>&1; then
  log "updating existing worktree at ${BUILD_DIR} → ${TARGET_SHA}"
  git -C "${BUILD_DIR}" fetch origin production 2>/dev/null || true
  git -C "${BUILD_DIR}" checkout -B "${BRANCH_NAME}" "${TARGET_SHA}"
  git -C "${BUILD_DIR}" reset --hard "${TARGET_SHA}"
  git -C "${BUILD_DIR}" clean -fd
else
  mkdir -p "$(dirname "${BUILD_DIR}")"
  if [[ -e "${BUILD_DIR}" ]]; then
    log "refusing to clobber non-worktree path ${BUILD_DIR}"
    exit 1
  fi
  log "creating worktree ${BUILD_DIR} at ${TARGET_SHA}"
  git -C "${MAIN_REPO}" worktree add -B "${BRANCH_NAME}" "${BUILD_DIR}" "${TARGET_SHA}"
fi

cd "${BUILD_DIR}"

if ! command -v pnpm >/dev/null 2>&1; then
  log "pnpm not found on PATH"
  exit 1
fi

log "pnpm install --filter @backsteros/server..."
pnpm install --frozen-lockfile --filter @backsteros/server...

log "building @backsteros/contracts"
pnpm --filter @backsteros/contracts build

# Stamp for /health even when the process starts without a full .git (and so
# the LaunchAgent can export the same values).
mkdir -p core/server
cat >core/server/build-info.json <<JSON
{
  "commit": "${TARGET_SHA}",
  "builtAt": "${BUILT_AT}",
  "dirty": false
}
JSON

log "ready: ${BUILD_DIR}"
log "  commit:  ${TARGET_SHA}"
log "  builtAt: ${BUILT_AT}"
log "  next:    restart com.backsteros.local-core (see scripts/local-core/README.md)"
