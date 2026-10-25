#!/usr/bin/env bash
# Update the dedicated local-core build worktree to origin/production, then
# publish a non-git copy into ~/.backsteros/local-core-runtime/current.
#
# Build path:   ~/.backsteros/local-core-build   (BACKSTEROS_LOCAL_CORE_BUILD)
# Runtime path: ~/.backsteros/local-core-runtime (BACKSTEROS_LOCAL_CORE_RUNTIME)
#   Layout: DO_NOT_DELETE, staging/, current/, previous/
#
# Override paths for scratch tests — do not point Remon's live LaunchAgent at
# an unfinished tree.
#
# After a cloud-core deploy, run this then restart the local-core LaunchAgent
# so the replica serves the same commit as cloud.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

LABEL="local-core-build"
BUILD_DIR="${BACKSTEROS_LOCAL_CORE_BUILD:-${HOME}/.backsteros/local-core-build}"
RUNTIME_DIR="${BACKSTEROS_LOCAL_CORE_RUNTIME:-${HOME}/.backsteros/local-core-runtime}"
BRANCH_NAME="${BACKSTEROS_LOCAL_CORE_BUILD_BRANCH:-local-core-build}"
SOURCE_REF="${BACKSTEROS_LOCAL_CORE_REF:-origin/production}"
FORCE_REPLACE=0

for arg in "$@"; do
  case "${arg}" in
    --force-replace-runtime) FORCE_REPLACE=1 ;;
    -h|--help)
      echo "Usage: $0 [--force-replace-runtime]"
      exit 0
      ;;
  esac
done

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

ensure_runtime_parent() {
  mkdir -p "${RUNTIME_DIR}"
  local sentinel="${RUNTIME_DIR}/DO_NOT_DELETE"
  if [[ ! -f "${sentinel}" ]]; then
    printf '%s\n' "${LOCAL_CORE_DO_NOT_DELETE_TEXT}" >"${sentinel}"
    log "wrote ${sentinel}"
  fi
}

verify_staging() {
  local staging="$1"
  local missing=0
  for rel in \
    scripts/local-core/run.sh \
    core/server/build-info.json \
    node_modules \
    docker-compose.yml
  do
    if [[ ! -e "${staging}/${rel}" ]]; then
      log "staging missing required path: ${rel}"
      missing=1
    fi
  done
  if [[ "${missing}" -ne 0 ]]; then
    return 1
  fi
  return 0
}

publish_runtime() {
  local staging="${RUNTIME_DIR}/staging"
  local current="${RUNTIME_DIR}/current"
  local previous="${RUNTIME_DIR}/previous"

  ensure_runtime_parent

  log "publishing ${BUILD_DIR} → ${RUNTIME_DIR} (staging)"
  # Clear staging only (never the sentinel parent or live current).
  if [[ -e "${staging}" ]]; then
    if local_core_has_do_not_delete "${staging}"; then
      log "refusing to clear staging: unexpected DO_NOT_DELETE inside ${staging}"
      return 1
    fi
    rm -rf "${staging}"
  fi
  mkdir -p "${staging}"

  if ! command -v rsync >/dev/null 2>&1; then
    log "rsync not found on PATH"
    return 1
  fi

  rsync -a \
    --exclude '.git' \
    --exclude '.git/' \
    --delete \
    "${BUILD_DIR}/" "${staging}/"

  # Overlay supervisor scripts from the checkout that invoked this script so
  # runtime/current gets the latest LaunchAgent logic even when origin/production
  # has not picked up these changes yet. Drop once production includes them.
  mkdir -p "${staging}/scripts/local-core"
  rsync -a \
    --exclude 'test-*.sh' \
    "${SCRIPT_DIR}/" "${staging}/scripts/local-core/"
  log "overlaid scripts/local-core from ${SCRIPT_DIR}"

  if ! verify_staging "${staging}"; then
    log "staging verification failed; leaving live current untouched"
    return 1
  fi

  export LOCAL_CORE_STAGING_COMPLETE=1
  if [[ "${FORCE_REPLACE}" -eq 1 ]]; then
    export LOCAL_CORE_FORCE_REPLACE_RUNTIME=1
  fi

  # Atomic swap on the same filesystem: current → previous, staging → current.
  # Never rm -rf live current before the mv succeeds.
  if [[ -e "${previous}" ]]; then
    if local_core_has_do_not_delete "${previous}"; then
      log "refusing to clear previous: unexpected DO_NOT_DELETE inside ${previous}"
      return 1
    fi
    rm -rf "${previous}"
  fi

  if [[ -e "${current}" ]]; then
    if local_core_has_do_not_delete "${current}"; then
      # Live tree should not carry the parent sentinel; refuse blind delete.
      if [[ "${FORCE_REPLACE}" -ne 1 ]]; then
        log "refusing to move current: contains DO_NOT_DELETE (pass --force-replace-runtime)"
        return 1
      fi
    fi
    log "moving current → previous"
    mv "${current}" "${previous}"
  fi

  log "moving staging → current"
  mv "${staging}" "${current}"

  # Keep previous briefly for rollback; next publish removes it above.
  log "published runtime current=${current}"
  if [[ -d "${previous}" ]]; then
    log "  previous kept at ${previous}"
  fi
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

log "ready build: ${BUILD_DIR}"
log "  commit:  ${TARGET_SHA}"
log "  builtAt: ${BUILT_AT}"

publish_runtime

log "ready runtime: ${RUNTIME_DIR}/current"
log "  next:    restart com.backsteros.local-core (see scripts/local-core/README.md)"
