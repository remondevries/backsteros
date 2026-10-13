#!/usr/bin/env bash
# Used at Docker build time inside the frontend image.
set -euo pipefail

OVERLAY=/opt/branding/overlay
APP=/var/www/app

cp -a "$OVERLAY/images/." "$APP/images/"

# Minimal title replacements without Python (image may lack it).
# Sprite body replacement is also done here with a tiny awk-less Python if present,
# otherwise we only copy loose files and rely on host apply script for sprites.
if command -v python3 >/dev/null 2>&1; then
  python3 /opt/branding/bin/patch-index-sprites.py "$APP/images" "$APP/index.html"
else
  echo "python3 not in image; copying assets only (run host apply-branding.sh for sprites)" >&2
  # Still try basic title sed
  sed -i \
    -e 's#<title>[^<]*</title>#<title>BacksterDESIGN</title>#' \
    -e 's#content="Penpot | Full-stack design"#content="BacksterDESIGN"#g' \
    "$APP/index.html" || true
fi
