#!/usr/bin/env bash
# Sync nested development/ from a pingdotgg/t3code checkout.
# Default is dry-run. Use --apply to write. See docs/internals/upstream-sync.md.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${ROOT_DIR}/.." && pwd)"
DEFAULT_UPSTREAM="${REPO_ROOT}/tmp/t3-code-v0045"
UPSTREAM="${T3CODE_UPSTREAM:-${DEFAULT_UPSTREAM}}"
MODE="dry-run"

usage() {
  cat <<'EOF'
Usage: sync-upstream-t3code.sh [--dry-run|--apply] [--upstream <path>]

  --dry-run   Show what rsync would change (default)
  --apply     Copy upstream into development/ (excludes preserve paths;
              backs up forked hotspots first)
  --upstream  Path to a pingdotgg/t3code checkout (default: ../tmp/t3-code-v0045
              or T3CODE_UPSTREAM)

See docs/internals/upstream-sync.md.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) MODE="dry-run"; shift ;;
    --apply) MODE="apply"; shift ;;
    --upstream)
      UPSTREAM="${2:?--upstream requires a path}"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -d "${UPSTREAM}" ]]; then
  echo "Upstream checkout missing: ${UPSTREAM}" >&2
  echo "Clone with:" >&2
  echo "  git clone --depth 1 --branch v0.0.45 https://github.com/pingdotgg/t3code.git ${DEFAULT_UPSTREAM}" >&2
  exit 1
fi

if [[ ! -f "${UPSTREAM}/package.json" ]] || [[ ! -d "${UPSTREAM}/apps" ]]; then
  echo "Does not look like a t3code tree: ${UPSTREAM}" >&2
  exit 1
fi

# Paths that must never be overwritten by upstream.
PRESERVE_EXCLUDES=(
  --exclude '.env'
  --exclude '.env.*'
  --exclude '.t3/'
  --exclude 'node_modules/'
  --exclude 'release/'
  --exclude '.electron-runtime/'
  --exclude 'apps/desktop/.electron-runtime/'
  --exclude '.vite-plus/'
  --exclude '.DS_Store'
  --exclude '**/target/'
  --exclude '**/*.tsbuildinfo'
  --exclude '.t3-sync-last-hotspot-backup'
  --exclude 'docs/internals/upstream-sync.md'
  --exclude 'scripts/sync-upstream-t3code.sh'
  --exclude 'apps/web/src/backsteros/'
  --exclude 'apps/web/src/components/servers/'
  --exclude 'apps/web/src/components/sidebar/Backsteros*'
  --exclude 'apps/web/src/components/chat/Backsteros*'
  --exclude 'apps/web/src/components/settings/Backsteros*'
  --exclude 'apps/web/src/routes/_chat.backsteros.projects.tsx'
  --exclude 'apps/web/src/routes/_chat.backsteros.project.$projectId.tsx'
  --exclude 'apps/server/src/backsteros/'
  --exclude 'apps/server/src/hetzner/'
  --exclude 'apps/server/src/cursorPrepaidUsage.ts'
  --exclude 'apps/server/src/cursorUsage.ts'
  --exclude 'apps/server/src/cursorUsage.test.ts'
  --exclude 'packages/shared/src/backsterosTaskAutoPromote.ts'
  --exclude 'packages/shared/src/backsterosTaskAutoPromote.test.ts'
  --exclude 'docs/internals/backsteros-control-api.md'
  --exclude 'docs/user/backsteros-file-task.md'
  # Keep Backster Vite proxy wiring when re-running apply mid-merge.
  --exclude 'apps/web/vite.config.ts'
  --exclude 'apps/web/index.html'
)

# Forked files: backed up on --apply, then replaced with upstream.
HOTSPOTS=(
  'apps/web/src/components/Sidebar.tsx'
  'apps/web/src/components/AppSidebarLayout.tsx'
  'apps/web/src/components/chat/ComposerSurface.tsx'
  'apps/web/src/components/WorkspacePageContainer.tsx'
  'apps/server/src/http.ts'
  'apps/server/src/server.ts'
  'packages/shared/src/keybindings.ts'
  'apps/desktop/src/app/DesktopEnvironment.ts'
  'apps/desktop/src/electron/ElectronProtocol.ts'
  'AGENTS.md'
)

backup_hotspots() {
  local stamp backup_root
  stamp="$(date +%Y%m%d-%H%M%S)"
  backup_root="${REPO_ROOT}/tmp/t3-sync-hotspot-backup-${stamp}"
  mkdir -p "${backup_root}"
  echo "Backing up hotspots → ${backup_root}"
  local rel
  for rel in "${HOTSPOTS[@]}"; do
    if [[ -f "${ROOT_DIR}/${rel}" ]]; then
      mkdir -p "${backup_root}/$(dirname "${rel}")"
      cp -p "${ROOT_DIR}/${rel}" "${backup_root}/${rel}"
      echo "  saved ${rel}"
    else
      echo "  skip (missing) ${rel}"
    fi
  done
  echo "${backup_root}" >"${ROOT_DIR}/.t3-sync-last-hotspot-backup"
  echo "Wrote ${ROOT_DIR}/.t3-sync-last-hotspot-backup"
}

RSYNC_FLAGS=(-a --delete --exclude '.git/')
RSYNC_FLAGS+=("${PRESERVE_EXCLUDES[@]}")

# Do not delete Backster-only dirs/files that upstream lacks.
RSYNC_FLAGS+=(
  --filter 'P apps/web/src/backsteros/'
  --filter 'P apps/server/src/backsteros/'
  --filter 'P apps/server/src/hetzner/'
  --filter 'P apps/web/src/components/servers/'
  --filter 'P packages/shared/src/backsterosTaskAutoPromote.ts'
  --filter 'P packages/shared/src/backsterosTaskAutoPromote.test.ts'
  --filter 'P apps/web/vite.config.ts'
  --filter 'P apps/web/index.html'
  --filter 'P docs/internals/upstream-sync.md'
  --filter 'P scripts/sync-upstream-t3code.sh'
)

echo "Source:      ${UPSTREAM}"
echo "Destination: ${ROOT_DIR}"
echo "Mode:        ${MODE}"
if [[ -f "${UPSTREAM}/apps/desktop/package.json" ]]; then
  echo -n "Upstream desktop version: "
  node -pe 'require(process.argv[1]).version' "${UPSTREAM}/apps/desktop/package.json"
fi
if [[ -f "${ROOT_DIR}/apps/desktop/package.json" ]]; then
  echo -n "Local desktop version:    "
  node -pe 'require(process.argv[1]).version' "${ROOT_DIR}/apps/desktop/package.json"
fi
echo

if [[ "${MODE}" == "dry-run" ]]; then
  RSYNC_FLAGS+=(--dry-run --itemize-changes --out-format='%i %n%L')
  echo "Dry-run (no writes). Pass --apply to sync."
  echo "Hotspots that would be replaced by upstream (re-wire after apply):"
  local_rel=
  for local_rel in "${HOTSPOTS[@]}"; do
    if [[ -f "${ROOT_DIR}/${local_rel}" ]] && [[ -f "${UPSTREAM}/${local_rel}" ]]; then
      if ! cmp -s "${ROOT_DIR}/${local_rel}" "${UPSTREAM}/${local_rel}"; then
        echo "  DIFF  ${local_rel}"
      else
        echo "  same  ${local_rel}"
      fi
    elif [[ -f "${ROOT_DIR}/${local_rel}" ]]; then
      echo "  local-only ${local_rel}"
    else
      echo "  upstream-only/missing ${local_rel}"
    fi
  done
  echo
  rsync "${RSYNC_FLAGS[@]}" "${UPSTREAM}/" "${ROOT_DIR}/"
  echo
  echo "Dry-run complete. Review docs/internals/upstream-sync.md before --apply."
  exit 0
fi

backup_hotspots
# macOS ships an older rsync without GNU --info=; keep flags portable.
rsync "${RSYNC_FLAGS[@]}" --stats "${UPSTREAM}/" "${ROOT_DIR}/"
echo
echo "Apply complete. Next:"
echo "  1. Re-wire hotspots from the backup under tmp/t3-sync-hotspot-backup-*"
echo "  2. cd development && vp i"
echo "  3. vp run -r typecheck"
echo "See docs/internals/upstream-sync.md."
