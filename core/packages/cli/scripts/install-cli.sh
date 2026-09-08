#!/usr/bin/env bash
# Install the `backsteros` launcher onto PATH (~/.local/bin).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
SRC="$ROOT/core/packages/cli/bin/backsteros"
DEST_DIR="${HOME}/.local/bin"
DEST="$DEST_DIR/backsteros"

if [[ ! -f "$SRC" ]]; then
  echo "install-cli: missing $SRC" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
pnpm --dir "$ROOT" --filter @backsteros/cli build
chmod +x "$SRC"
ln -sfn "$SRC" "$DEST"
echo "Installed: $DEST -> $SRC"
command -v backsteros || true
backsteros --help | head -5
