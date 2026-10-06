#!/usr/bin/env bash
# Point Remon at a Keychain Access export of ONE Developer ID identity.
# `security export` cannot select a single identity; a CLI fallback would dump
# every identity in the keychain. This script never does that and never creates
# or modifies a keychain.
#
# Usage:
#   ./scripts/export-apple-cert-for-ci.sh "Developer ID Application: Your Name (TEAMID)"
set -euo pipefail
umask 077

IDENTITY="${1:-}"

print_manual_steps() {
  local identity="$1"
  local workdir="$2"
  cat <<EOF >&2

Export only this identity in Keychain Access (do not use \`security export\`):

  1. Open Keychain Access → login → My Certificates.
  2. Select exactly: ${identity}
  3. File → Export Items… → Personal Information Exchange (.p12).
  4. Save to: ${workdir}/apple-codesign.p12
  5. Set a passphrase; that value is APPLE_CERTIFICATE_PASSWORD / APPLE_P12_PASSWORD.

Then:

  openssl base64 -A -in ${workdir}/apple-codesign.p12 -out ${workdir}/certificate-base64.txt
  gh secret set APPLE_CERTIFICATE < ${workdir}/certificate-base64.txt
  gh secret set APPLE_CERTIFICATE_PASSWORD --body "\$APPLE_P12_PASSWORD"
  gh secret set KEYCHAIN_PASSWORD --body "\$(openssl rand -base64 24)"
  rm -f ${workdir}/apple-codesign.p12 ${workdir}/certificate-base64.txt

Copy desktop/scripts/apple-developer.env.example to
~/.config/secrets/apple-developer.env for local signed builds.
EOF
}

if [[ -z "$IDENTITY" ]]; then
  echo "Available codesigning identities:" >&2
  security find-identity -v -p codesigning >&2
  echo >&2
  echo "Usage: $0 \"Developer ID Application: Your Name (TEAMID)\"" >&2
  exit 1
fi

if [[ "$IDENTITY" == *"Apple Development:"* ]]; then
  echo "Refusing Apple Development identity — it cannot notarize. Use Developer ID Application." >&2
  exit 1
fi

if [[ "$IDENTITY" != *"Developer ID Application:"* ]]; then
  echo "Identity must start with 'Developer ID Application:'." >&2
  exit 1
fi

if ! security find-identity -v -p codesigning | grep -F -q "$IDENTITY"; then
  echo "That identity is not in the keychain:" >&2
  echo "  $IDENTITY" >&2
  security find-identity -v -p codesigning >&2
  exit 1
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/backsteros-apple-export.XXXXXX")"
echo "Refusing CLI export (it cannot isolate one identity). Work directory: $WORKDIR" >&2
print_manual_steps "$IDENTITY" "$WORKDIR"
exit 2
