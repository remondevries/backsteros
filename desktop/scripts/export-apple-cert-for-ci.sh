#!/usr/bin/env bash
# Export a Developer ID Application identity to base64 PKCS#12 for GitHub Actions.
# Apple Development certificates cannot notarize — refuse those names.
#
# Usage:
#   APPLE_P12_PASSWORD='…' ./scripts/export-apple-cert-for-ci.sh \
#     "Developer ID Application: Your Name (TEAMID)"
#
# Writes to /tmp by default (never the repo). Then:
#   gh secret set APPLE_CERTIFICATE < "$OUT_B64"
#   gh secret set APPLE_CERTIFICATE_PASSWORD --body "$APPLE_P12_PASSWORD"
#   gh secret set KEYCHAIN_PASSWORD --body "$(openssl rand -base64 24)"
# Also copy desktop/scripts/apple-developer.env.example to
# ~/.config/secrets/apple-developer.env for local builds.
set -euo pipefail

IDENTITY="${1:-}"
OUT_P12="${2:-/tmp/backsteros-apple-codesign.p12}"
OUT_B64="${3:-/tmp/backsteros-certificate-base64.txt}"

if [[ -z "$IDENTITY" ]]; then
  echo "Available codesigning identities:"
  security find-identity -v -p codesigning
  echo
  echo "Usage: $0 \"Developer ID Application: Your Name (TEAMID)\""
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

if [[ -z "${APPLE_P12_PASSWORD:-}" ]]; then
  echo "Set APPLE_P12_PASSWORD to the export passphrase (will also be APPLE_CERTIFICATE_PASSWORD)."
  exit 1
fi

security export -k ~/Library/Keychains/login.keychain-db \
  -t identities -f pkcs12 \
  -P "$APPLE_P12_PASSWORD" \
  -o "$OUT_P12" \
  "$IDENTITY" 2>/dev/null \
  || security export \
    -t identities -f pkcs12 \
    -P "$APPLE_P12_PASSWORD" \
    -o "$OUT_P12"

openssl base64 -A -in "$OUT_P12" -out "$OUT_B64"
echo "Wrote $OUT_P12 and $OUT_B64"
echo "Next: gh secret set APPLE_CERTIFICATE < $OUT_B64"
echo "      rm -f $OUT_P12 $OUT_B64  # do not commit these files"
