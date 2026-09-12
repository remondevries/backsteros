#!/usr/bin/env bash
# Mirror local vault markdown (+ small non-PDF blobs) to cloud-core vault.
# Bootstrap / disaster-recovery only — day-to-day markdown twinning is done by
# the core-replication worker (local → cloud) once both cores are updated.
#
# Usage:
#   ./deploy/cloud/sync-vault.sh
#   LOCAL_VAULT=/path/to/BacksterOS CLOUD_HOST=root@100.117.142.79 ./deploy/cloud/sync-vault.sh
#
# Does NOT sync letter PDFs (hybrid policy). Postgres twinning is separate
# (core replication worker).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOCAL_VAULT="${LOCAL_VAULT:-${BACKSTEROS_VAULT_PATH:-}}"
CLOUD_HOST="${CLOUD_HOST:-root@100.75.45.22}"
CLOUD_VAULT_VOLUME="${CLOUD_VAULT_VOLUME:-cloud_cloud_vault}"
DRY_RUN="${DRY_RUN:-0}"

if [[ -z "$LOCAL_VAULT" ]]; then
  if [[ -f "$ROOT/core/server/.env" ]]; then
    LOCAL_VAULT="$(grep -E '^BACKSTEROS_VAULT_PATH=' "$ROOT/core/server/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  fi
fi

if [[ -z "$LOCAL_VAULT" || ! -d "$LOCAL_VAULT" ]]; then
  echo "error: set LOCAL_VAULT or BACKSTEROS_VAULT_PATH to an existing vault directory" >&2
  exit 1
fi

REMOTE_VAULT="$(ssh -o BatchMode=yes "$CLOUD_HOST" \
  "docker volume inspect ${CLOUD_VAULT_VOLUME} -f '{{.Mountpoint}}'")"
if [[ -z "$REMOTE_VAULT" ]]; then
  echo "error: could not resolve docker volume ${CLOUD_VAULT_VOLUME} on ${CLOUD_HOST}" >&2
  exit 1
fi

RSYNC_FLAGS=(-a --delete --human-readable --stats)
if [[ "$DRY_RUN" == "1" ]]; then
  RSYNC_FLAGS+=(--dry-run)
fi

# Never ship PDFs or macOS AppleDouble / Finder junk to cloud.
EXCLUDES=(
  --exclude '*.pdf'
  --exclude '*.PDF'
  --exclude '._*'
  --exclude '.DS_Store'
  --exclude '.AppleDouble'
  --exclude '.Spotlight-V100'
  --exclude '.Trashes'
  --exclude '.fseventsd'
  --exclude '.TemporaryItems'
)

echo "local:  $LOCAL_VAULT"
echo "remote: ${CLOUD_HOST}:${REMOTE_VAULT}"
echo "mode:   $([[ "$DRY_RUN" == "1" ]] && echo dry-run || echo apply)"

if [[ "$DRY_RUN" != "1" ]]; then
  # Drop leftover AppleDouble from earlier naive tar copies before mirroring.
  ssh -o BatchMode=yes "$CLOUD_HOST" \
    "find \"$REMOTE_VAULT\" \\( -name '._*' -o -name '.DS_Store' \\) -delete; echo cleaned_mac_junk"
fi

rsync "${RSYNC_FLAGS[@]}" "${EXCLUDES[@]}" \
  -e "ssh -o BatchMode=yes" \
  "${LOCAL_VAULT%/}/" \
  "${CLOUD_HOST}:${REMOTE_VAULT%/}/"

echo
echo "=== post-sync counts ==="
LOCAL_MD="$(find "$LOCAL_VAULT" -type f -name '*.md' ! -name '._*' | wc -l | tr -d ' ')"
LOCAL_FILES="$(find "$LOCAL_VAULT" -type f ! -name '._*' ! -name '.DS_Store' ! -iname '*.pdf' | wc -l | tr -d ' ')"
REMOTE_MD="$(ssh -o BatchMode=yes "$CLOUD_HOST" "find \"$REMOTE_VAULT\" -type f -name '*.md' ! -name '._*' | wc -l")"
REMOTE_FILES="$(ssh -o BatchMode=yes "$CLOUD_HOST" "find \"$REMOTE_VAULT\" -type f ! -name '._*' ! -name '.DS_Store' ! -iname '*.pdf' | wc -l")"
REMOTE_AD="$(ssh -o BatchMode=yes "$CLOUD_HOST" "find \"$REMOTE_VAULT\" -name '._*' | wc -l")"
REMOTE_PDF="$(ssh -o BatchMode=yes "$CLOUD_HOST" "find \"$REMOTE_VAULT\" -iname '*.pdf' | wc -l")"
REMOTE_SIZE="$(ssh -o BatchMode=yes "$CLOUD_HOST" "du -sh \"$REMOTE_VAULT\" | awk '{print \$1}'")"
echo "local_md=$LOCAL_MD cloud_md=$(echo "$REMOTE_MD" | tr -d ' ')"
echo "local_files_ex_pdf=$LOCAL_FILES cloud_files=$(echo "$REMOTE_FILES" | tr -d ' ')"
echo "cloud_appledouble=$(echo "$REMOTE_AD" | tr -d ' ')"
echo "cloud_pdf=$(echo "$REMOTE_PDF" | tr -d ' ')"
echo "cloud_vault_size=$REMOTE_SIZE"

if [[ "$(echo "$REMOTE_MD" | tr -d ' ')" != "$LOCAL_MD" ]]; then
  echo "warning: markdown counts differ" >&2
  exit 2
fi
