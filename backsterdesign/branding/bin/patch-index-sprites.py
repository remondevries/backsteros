#!/usr/bin/env python3
"""Replace Penpot logo <symbol> bodies in index.html and sprite SVGs."""

from __future__ import annotations

import re
import sys
from pathlib import Path

SYMBOL_FILES = {
    "asset-penpot-logo": "assets/penpot-logo.svg",
    "asset-penpot-logo-icon": "assets/penpot-logo-icon.svg",
    "asset-penpot-logo-subtle": "assets/penpot-logo-subtle.svg",
    "icon-penpot-logo": "icons/penpot-logo.svg",
    "icon-penpot-logo-icon": "icons/penpot-logo-icon.svg",
    "icon-penpot-logo-icon-loader": "icons/penpot-logo-icon-loader.svg",
}


def svg_inner(svg_text: str) -> tuple[str, str]:
    m = re.search(r"<svg\b([^>]*)>(.*)</svg\s*>", svg_text, flags=re.I | re.S)
    if not m:
        raise ValueError("invalid svg")
    attrs, inner = m.group(1), m.group(2).strip()
    vb = re.search(r'viewBox\s*=\s*"([^"]+)"', attrs, flags=re.I)
    view_box = vb.group(1) if vb else "0 0 24 24"
    inner = re.sub(r'\sxmlns(:\w+)?="[^"]*"', "", inner)
    return view_box, inner


def replace_symbol(html: str, symbol_id: str, view_box: str, inner: str) -> str:
    pattern = re.compile(
        rf'<symbol\b([^>]*\bid="{re.escape(symbol_id)}"[^>]*)>.*?</symbol>',
        flags=re.I | re.S,
    )

    def repl(match: re.Match[str]) -> str:
        attrs = match.group(1)
        if re.search(r"viewBox\s*=", attrs, flags=re.I):
            attrs = re.sub(r'viewBox\s*=\s*"[^"]*"', f'viewBox="{view_box}"', attrs, flags=re.I)
        else:
            attrs = f'{attrs} viewBox="{view_box}"'
        return f"<symbol{attrs}>{inner}</symbol>"

    new_html, n = pattern.subn(repl, html, count=1)
    if n != 1:
        raise RuntimeError(f"symbol not found or ambiguous: {symbol_id} (matches={n})")
    return new_html


def patch_titles(html: str) -> str:
    replacements = [
        (r"<title>.*?</title>", "<title>BacksterDESIGN</title>"),
        (r'<meta name="description" content="[^"]*"',
         '<meta name="description" content="BacksterDESIGN — design workspace for BacksterOS."'),
        (r'<meta property="og:title" content="[^"]*"',
         '<meta property="og:title" content="BacksterDESIGN"'),
        (r'<meta property="og:description" content="[^"]*"',
         '<meta property="og:description" content="BacksterDESIGN — design workspace for BacksterOS."'),
        (r'<meta name="twitter:title" content="[^"]*"',
         '<meta name="twitter:title" content="BacksterDESIGN"'),
        (r'<meta name="twitter:description" content="[^"]*"',
         '<meta name="twitter:description" content="BacksterDESIGN — design workspace for BacksterOS."'),
    ]
    for pattern, repl in replacements:
        html, n = re.subn(pattern, repl, html, count=1, flags=re.I | re.S)
        if n != 1:
            print(f"warn: title/meta pattern not applied: {pattern}", file=sys.stderr)
    return html


def patch_file(path: Path, overlay: Path, *, titles: bool) -> None:
    html = path.read_text(encoding="utf-8", errors="ignore")
    patched_any = False
    for symbol_id, rel in SYMBOL_FILES.items():
        if f'id="{symbol_id}"' not in html and f"id='{symbol_id}'" not in html:
            continue
        view_box, inner = svg_inner((overlay / rel).read_text(encoding="utf-8"))
        html = replace_symbol(html, symbol_id, view_box, inner)
        print(f"patched symbol {symbol_id} in {path.name}")
        patched_any = True
    if titles and path.name == "index.html":
        html = patch_titles(html)
    if patched_any or titles:
        path.write_text(html, encoding="utf-8")
        print(f"wrote {path}")
    else:
        print(f"no matching symbols in {path}")


def main() -> int:
    if len(sys.argv) < 3:
        print(f"usage: {sys.argv[0]} <overlay_images_dir> <file> [file...]", file=sys.stderr)
        return 2
    overlay = Path(sys.argv[1])
    for raw in sys.argv[2:]:
        patch_file(Path(raw), overlay, titles=(Path(raw).name == "index.html"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
