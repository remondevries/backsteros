#!/usr/bin/env bash
# Apply BacksterDESIGN branding into the Penpot fork source tree (backsterdesign/).
# Use this for local devenv. For the stock Docker host, use apply-branding.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESIGN_ROOT="$(cd "$ROOT/.." && pwd)"
OVERLAY="$ROOT/overlay"
IMG="$DESIGN_ROOT/frontend/resources/images"
PUBLIC="$DESIGN_ROOT/frontend/resources/public"
MUSTACHE="$DESIGN_ROOT/frontend/resources/templates/index.mustache"

if [[ ! -d "$IMG" ]]; then
  echo "apply-to-source: frontend resources missing at $IMG" >&2
  exit 1
fi

echo "Copying logo / favicon assets into frontend/resources/images/…"
cp -f "$OVERLAY/images/favicon.png" "$IMG/favicon.png"
cp -f "$OVERLAY/images/penpot-link-preview.png" "$IMG/penpot-link-preview.png"
cp -f "$OVERLAY/images/assets/"*.svg "$IMG/assets/"
cp -f "$OVERLAY/images/icons/penpot-logo.svg" "$IMG/icons/penpot-logo.svg"
cp -f "$OVERLAY/images/icons/penpot-logo-icon.svg" "$IMG/icons/penpot-logo-icon.svg"
cp -f "$OVERLAY/images/icons/penpot-logo-icon-loader.svg" "$IMG/icons/penpot-logo-icon-loader.svg"
cp -f "$OVERLAY/images/email/logo-penpot.svg" "$IMG/email/logo-penpot.svg"
# logo-small is Backster-only (workspace header CSS)
cp -f "$OVERLAY/images/assets/logo-small.svg" "$IMG/assets/logo-small.svg"

echo "Staging brand CSS/JS into resources/public/…"
mkdir -p "$PUBLIC/css" "$PUBLIC/js"
cp -f "$OVERLAY/css/backster-brand.css" "$PUBLIC/css/backster-brand.css"
cp -f "$OVERLAY/js/backster-brand.js" "$PUBLIC/js/backster-brand.js"

# Also mirror into public/images now so a running devenv picks up logos
# before the next watch copyAssets cycle.
if [[ -d "$PUBLIC/images" ]]; then
  mkdir -p "$PUBLIC/images/assets" "$PUBLIC/images/icons" "$PUBLIC/images/email"
  cp -f "$OVERLAY/images/favicon.png" "$PUBLIC/images/favicon.png"
  cp -f "$OVERLAY/images/penpot-link-preview.png" "$PUBLIC/images/penpot-link-preview.png"
  cp -f "$OVERLAY/images/assets/"*.svg "$PUBLIC/images/assets/"
  cp -f "$OVERLAY/images/icons/penpot-logo.svg" "$PUBLIC/images/icons/penpot-logo.svg"
  cp -f "$OVERLAY/images/icons/penpot-logo-icon.svg" "$PUBLIC/images/icons/penpot-logo-icon.svg"
  cp -f "$OVERLAY/images/icons/penpot-logo-icon-loader.svg" "$PUBLIC/images/icons/penpot-logo-icon-loader.svg"
  cp -f "$OVERLAY/images/email/logo-penpot.svg" "$PUBLIC/images/email/logo-penpot.svg"
fi

echo "Updating index.mustache titles + brand inject…"
python3 - <<'PY' "$MUSTACHE"
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
html = path.read_text(encoding="utf-8")

replacements = [
    (r"<title>.*?</title>", "<title>BacksterDESIGN</title>"),
    (
        r'<meta name="description" content="[^"]*"',
        '<meta name="description" content="BacksterDESIGN — design workspace for BacksterOS."',
    ),
    (r'<meta property="og:title" content="[^"]*"', '<meta property="og:title" content="BacksterDESIGN"'),
    (
        r'<meta property="og:description" content="[^"]*"',
        '<meta property="og:description" content="BacksterDESIGN — design workspace for BacksterOS."',
    ),
    (r'<meta name="twitter:title" content="[^"]*"', '<meta name="twitter:title" content="BacksterDESIGN"'),
    (
        r'<meta name="twitter:description" content="[^"]*"',
        '<meta name="twitter:description" content="BacksterDESIGN — design workspace for BacksterOS."',
    ),
]
for pattern, repl in replacements:
    html, n = re.subn(pattern, repl, html, count=1, flags=re.I | re.S)
    if n != 1:
        print(f"warn: pattern not applied: {pattern}", file=sys.stderr)

css = '<link rel="stylesheet" href="css/backster-brand.css?version={{& version_tag}}" />'
js = '<script src="js/backster-brand.js?version={{& version_tag}}" defer></script>'
if "backster-brand.css" not in html:
    if "</head>" not in html:
        raise SystemExit("no </head> in index.mustache")
    html = html.replace("</head>", f"    {css}\n  </head>", 1)
if "backster-brand.js" not in html:
    if "</body>" in html:
        html = html.replace("</body>", f"    {js}\n  </body>", 1)
    else:
        raise SystemExit("no </body> in index.mustache")

path.write_text(html, encoding="utf-8")
print(f"updated {path}")
PY

# If public sprites / index already exist, patch them in place for immediate effect.
if [[ -f "$PUBLIC/index.html" ]]; then
  echo "Patching live public/index.html + sprites…"
  patch_args=("$PUBLIC/index.html")
  [[ -f "$PUBLIC/images/sprites/symbol/icons.svg" ]] && patch_args+=("$PUBLIC/images/sprites/symbol/icons.svg")
  [[ -f "$PUBLIC/images/sprites/assets.svg" ]] && patch_args+=("$PUBLIC/images/sprites/assets.svg")
  python3 "$ROOT/bin/patch-index-sprites.py" "$OVERLAY/images" "${patch_args[@]}"

  python3 - <<'PY' "$PUBLIC/index.html"
from pathlib import Path
import sys
path = Path(sys.argv[1])
html = path.read_text(encoding="utf-8", errors="ignore")
css = '<link rel="stylesheet" href="css/backster-brand.css" />'
js = '<script src="js/backster-brand.js" defer></script>'
changed = False
if "backster-brand.css" not in html:
    html = html.replace("</head>", f"    {css}\n  </head>", 1)
    changed = True
if "backster-brand.js" not in html:
    html = html.replace("</body>", f"    {js}\n  </body>", 1)
    changed = True
if changed:
    path.write_text(html, encoding="utf-8")
    print("injected brand css/js into public/index.html")
else:
    print("brand css/js already in public/index.html")
PY
fi

echo "Done. Hard-refresh the browser (Cmd+Shift+R)."
echo "Sprites will fully regenerate on the next frontend watch cycle (or restart: pnpm --filter @backsteros/design dev)."
