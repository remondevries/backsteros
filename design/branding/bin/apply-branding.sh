#!/usr/bin/env bash
# Apply BacksterDESIGN branding onto the running penpot-frontend container.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OVERLAY="$ROOT/overlay"
CONTAINER="${PENPOT_FRONTEND_CONTAINER:-penpot-penpot-frontend-1}"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "container not found: $CONTAINER" >&2
  exit 1
fi

echo "Copying overlay into $CONTAINER..."
docker cp "$OVERLAY/images/favicon.png" "$CONTAINER:/var/www/app/images/favicon.png"
docker cp "$OVERLAY/images/penpot-link-preview.png" "$CONTAINER:/var/www/app/images/penpot-link-preview.png"
docker cp "$OVERLAY/images/assets/." "$CONTAINER:/var/www/app/images/assets/"
docker cp "$OVERLAY/images/icons/penpot-logo.svg" "$CONTAINER:/var/www/app/images/icons/penpot-logo.svg"
docker cp "$OVERLAY/images/icons/penpot-logo-icon.svg" "$CONTAINER:/var/www/app/images/icons/penpot-logo-icon.svg"
docker cp "$OVERLAY/images/icons/penpot-logo-icon-loader.svg" "$CONTAINER:/var/www/app/images/icons/penpot-logo-icon-loader.svg"
docker cp "$OVERLAY/images/email/logo-penpot.svg" "$CONTAINER:/var/www/app/images/email/logo-penpot.svg"

docker exec "$CONTAINER" mkdir -p /var/www/app/css /var/www/app/js
docker cp "$OVERLAY/css/backster-brand.css" "$CONTAINER:/var/www/app/css/backster-brand.css"
docker cp "$OVERLAY/js/backster-brand.js" "$CONTAINER:/var/www/app/js/backster-brand.js"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Patching index.html + sprite sheets..."
docker cp "$CONTAINER:/var/www/app/index.html" "$TMP/index.html"
docker cp "$CONTAINER:/var/www/app/images/sprites/symbol/icons.svg" "$TMP/icons.svg"
docker cp "$CONTAINER:/var/www/app/images/sprites/assets.svg" "$TMP/assets.svg"

python3 "$ROOT/bin/patch-index-sprites.py" "$OVERLAY/images" \
  "$TMP/index.html" "$TMP/icons.svg" "$TMP/assets.svg"

python3 - <<'PY' "$TMP/index.html"
from pathlib import Path
import sys
path = Path(sys.argv[1])
html = path.read_text(encoding="utf-8", errors="ignore")
css = '<link rel="stylesheet" href="/css/backster-brand.css" />'
js = '<script src="/js/backster-brand.js" defer></script>'
changed = False
if "backster-brand.css" not in html:
    if "</head>" in html:
        html = html.replace("</head>", f"    {css}\n  </head>", 1)
        changed = True
    else:
        raise SystemExit("no </head> in index.html")
if "backster-brand.js" not in html:
    if "</body>" in html:
        html = html.replace("</body>", f"    {js}\n  </body>", 1)
        changed = True
    elif "</html>" in html:
        html = html.replace("</html>", f"    {js}\n</html>", 1)
        changed = True
    else:
        html += js
        changed = True
if changed:
    path.write_text(html, encoding="utf-8")
    print("injected brand css/js into index.html")
else:
    print("brand css/js already present in index.html")
PY

docker cp "$TMP/index.html" "$CONTAINER:/var/www/app/index.html"
docker cp "$TMP/icons.svg" "$CONTAINER:/var/www/app/images/sprites/symbol/icons.svg"
docker cp "$TMP/assets.svg" "$CONTAINER:/var/www/app/images/sprites/assets.svg"

echo "Branding applied. Hard-refresh the browser."
