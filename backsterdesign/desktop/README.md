# BacksterDESIGN desktop (`@backsteros/design-desktop`)

Tauri 2 shell for BacksterDESIGN: overlay titlebar, native tab strip, **one**
embedded Penpot SPA (iframe). Switching tabs routes inside the SPA — it does
not remount `main.js` or bootstrap WASM again.

## Auth / cookies (v1)

Penpot sets `X-Frame-Options: SAMEORIGIN`, so the SPA is **not** loaded in an
iframe. The shell uses a **child Tauri webview** (`design`) pointed at
`PENPOT_PUBLIC_URI`. Session cookies stay first-party on that origin.

### Local devenv TLS (macOS)

The devenv cert is self-signed (`docker/devenv/files/selfsigned.crt`). WKWebView
shows a blank page until it is trusted:

```bash
security add-trusted-cert -r trustRoot \
  -k "$HOME/Library/Keychains/login.keychain-db" \
  backsterdesign/docker/devenv/files/selfsigned.crt
```

Then restart the desktop app.

## Run

Requires a reachable Penpot backend (local devenv or hosted).

```bash
# Day-to-day: hosted fork (default URI)
pnpm --filter @backsteros/design-desktop tauri:dev

# Fork / CLJS work against local devenv
pnpm --filter @backsteros/design dev   # Terminal A
export PENPOT_PUBLIC_URI=https://localhost:3449
pnpm --filter @backsteros/design-desktop tauri:dev   # Terminal B
```

Or Vite-only (browser preview of chrome):

```bash
pnpm --filter @backsteros/design-desktop dev
```

### Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PENPOT_PUBLIC_URI` / `VITE_PENPOT_PUBLIC_URI` | `https://design.lemo-design.com` | Origin loaded in the design webview |

Local devenv override: `PENPOT_PUBLIC_URI=https://localhost:3449`.

## Tabs

- Look matches BacksterOS content tabs (30px pills, same tokens).
- Floating logo (not a pill) goes to the dashboard; file tabs + `+` follow.
- Soft max **8** open file tabs; oldest inactive tab is closed when exceeded.
- Session persists in `localStorage` (`backsterdesign.desktop.tabs`): open
  file tabs, focused tab (or dashboard), page/board location per tab, and
  last dashboard section. On next launch the shell restores chrome immediately
  and rehydrates the SPA after `spa-ready`.
- Bridge channel: `backsterdesign-desktop` (`postMessage` / `app.main.desktop`).

## Content frame

Penpot sits in an inset rounded frame (8px gutter, 0.5px border, 8px radius),
same idea as BacksterOS `.content-frame`. The chrome webview paints the ring;
the design webview is laid out over the interior and clipped on macOS.
