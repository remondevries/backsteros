#!/usr/bin/env bash
# Export a codesigning identity to base64 PKCS#12 for GitHub Actions.
# Requires a Developer ID Application cert for distribution (not Apple Development).
#
# Usage:
#   ./scripts/export-apple-cert-for-ci.sh "Developer ID Application: …"
# Then:
#   gh secret set APPLE_CERTIFICATE < certificate-base64.txt
#   gh secret set APPLE_CERTIFICATE_PASSWORD --body '…'
#   gh secret set KEYCHAIN_PASSWORD --body "$(openssl rand -base64 24)"
set -euo pipefail

IDENTITY="${1:-}"
OUT_P12="${2:-./apple-codesign.p12}"
OUT_B64="${3:-./certificate-base64.txt}"

if [[ -z "$IDENTITY" ]]; then
  echo "Available codesigning identities:"
  security find-identity -v -p codesigning
  echo
  echo "Usage: $0 \"Developer ID Application: Your Name (TEAMID)\""
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
