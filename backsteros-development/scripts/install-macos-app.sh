#!/usr/bin/env bash
# Install a macOS .app that launches the BacksterOS development console in an
# app-style Chrome window (fallback if you do not want the Tauri shell).
# Prefer: pnpm desktop:install  (native window → same Next.js app)
#
# Usage:
#   ./scripts/install-macos-app.sh
#   ./scripts/install-macos-app.sh ~/Applications
#
# Then open "Development ADE" from Applications / Spotlight / Dock.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LAUNCHER="${SCRIPT_DIR}/launch-console-app.sh"
DEST_DIR="${1:-${HOME}/Applications}"
APP_NAME="Development ADE.app"
OLD_APP_NAME="BacksterOS Development.app"
APP_ROOT="${DEST_DIR}/${APP_NAME}"
MACOS_DIR="${APP_ROOT}/Contents/MacOS"
RESOURCES_DIR="${APP_ROOT}/Contents/Resources"

chmod +x "${LAUNCHER}"

rm -rf "${DEST_DIR}/${OLD_APP_NAME}"
mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}"

cat >"${MACOS_DIR}/Development ADE" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec /bin/bash $(printf '%q' "${LAUNCHER}")
EOF
chmod +x "${MACOS_DIR}/Development ADE"

cat >"${APP_ROOT}/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>Development ADE</string>
  <key>CFBundleIdentifier</key>
  <string>com.backsteros.development</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Development ADE</string>
  <key>CFBundleDisplayName</key>
  <string>Development ADE</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

echo "Installed: ${APP_ROOT}"
echo "Open it once from Finder (right-click → Open if Gatekeeper warns)."
echo "Then drag it to the Dock if you want."
echo ""
echo "First launch may build Next/.next and @backsteros/ui if needed."
echo "Keep the API running separately (repo root: pnpm dev) when you need tasks/data."
