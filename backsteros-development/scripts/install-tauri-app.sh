#!/usr/bin/env bash
# Build the thin Tauri wrapper and install BacksterOS Development.app.
# Same Next.js console as `pnpm dev` — native window only, no UI rewrite.
#
# Usage:
#   ./scripts/install-tauri-app.sh
#   ./scripts/install-tauri-app.sh ~/Applications
#   pnpm desktop:install

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEST_DIR="${1:-${HOME}/Applications}"
PRODUCT_NAME="BacksterOS Development.app"

cd "${APP_DIR}"

echo "[desktop] Building Tauri shell…"
pnpm exec tauri build

# Prefer universal / release bundle path used by Tauri 2 on macOS
BUNDLE_APP=""
for candidate in \
  "${APP_DIR}/src-tauri/target/release/bundle/macos/${PRODUCT_NAME}" \
  "${APP_DIR}/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/${PRODUCT_NAME}" \
  "${APP_DIR}/src-tauri/target/x86_64-apple-darwin/release/bundle/macos/${PRODUCT_NAME}"
do
  if [[ -d "${candidate}" ]]; then
    BUNDLE_APP="${candidate}"
    break
  fi
done

if [[ -z "${BUNDLE_APP}" ]]; then
  echo "[desktop] Built .app not found under src-tauri/target/*/bundle/macos/" >&2
  find "${APP_DIR}/src-tauri/target" -name "${PRODUCT_NAME}" -type d 2>/dev/null | head -20 >&2 || true
  exit 1
fi

mkdir -p "${DEST_DIR}"
DEST_APP="${DEST_DIR}/${PRODUCT_NAME}"
rm -rf "${DEST_APP}"
cp -R "${BUNDLE_APP}" "${DEST_APP}"

# Packaged binary resolves the launch script via compile-time CARGO_MANIFEST_DIR
# (this machine's backsteros-development/). Override if you move the repo:
#   launchctl setenv BACKSTEROS_DEVELOPMENT_DIR /path/to/backsteros-development

echo "Installed: ${DEST_APP}"
echo "Open once from Finder if Gatekeeper warns (right-click → Open)."
echo "Keep the API running separately (repo root: pnpm dev) when you need tasks/data."
