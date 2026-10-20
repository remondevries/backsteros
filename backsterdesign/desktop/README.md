# BacksterDESIGN desktop (`@backsteros/design-desktop`)

Tauri 2 shell for BacksterDESIGN: overlay titlebar, native tab strip, **one**
embedded Penpot SPA (webview). Switching tabs routes inside the SPA — it does
not remount `main.js` or bootstrap WASM again.

## Two tracks: local vs hosted

| Track | When | Penpot origin |
| --- | --- | --- |
| **Dev** | Change / test the fork | `https://localhost:3449` (local devenv) |
| **Real work** | Staff + clients | `https://design.lemo-design.com` (lemodesign) |

- `pnpm … tauri:dev` → **local** by default.
- Installed / `tauri:build` app → **hosted** by default.
- Local and hosted are **separate databases and object stores**. Staff login can
  match (see below); design **files do not live-sync**.

Promote fork changes with the deploy flow in `../deploy/README.md`.

### Same staff login on local

Credentials live in `~/.config/secrets/backsterdesign.env` (not in git). After
devenv is up:

```bash
pnpm --filter @backsteros/design exec bash ../../backsterdesign/scripts/backster-dev.sh ensure-staff
# or: backsterdesign/scripts/ensure-staff-account.sh local
```

That sets `accounts@lemo-design.com` on local PREPL to the same password as
hosted. Hosted is updated the same way via PREPL on lemodesign when the password
changes.

### Design files / R2 (no live sync)

| | Local devenv | Hosted (`design.lemo-design.com`) |
| --- | --- | --- |
| Metadata | local Postgres | Postgres on lemodesign |
| Blobs | local RustFS (S3) | Cloudflare R2 (`backsteros-files`) |

A Penpot file needs **both** the DB rows and the blobs. Pointing local at the
production R2 bucket (or sharing one live DB) would let a broken local build
overwrite real work — we do **not** do that.

Use local for code changes and throwaway files. Use the hosted app for real
client work. When you need a one-way copy (local → hosted or a hosted snapshot
→ local), that is a deliberate migrate/export — not continuous sync.

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

### Day-to-day development (local Penpot)

```bash
# Terminal A — local fork (Docker)
pnpm --filter @backsteros/design dev
# → https://localhost:3449

# Terminal B — desktop shell (defaults to localhost:3449)
pnpm --filter @backsteros/design-desktop tauri:dev
```

Staff login: same email/password as hosted after `ensure-staff` (see above).

### Point the shell at hosted (optional)

```bash
pnpm --filter @backsteros/design-desktop tauri:dev:hosted
# or: PENPOT_PUBLIC_URI=https://design.lemo-design.com pnpm --filter @backsteros/design-desktop tauri:dev
```

### Production desktop build

```bash
pnpm --filter @backsteros/design-desktop tauri:build
# ships with https://design.lemo-design.com
```

Or Vite-only (browser preview of chrome):

```bash
pnpm --filter @backsteros/design-desktop dev
```

### Environment

| Variable | Dev default | Release default | Meaning |
| --- | --- | --- | --- |
| `PENPOT_PUBLIC_URI` / `VITE_PENPOT_PUBLIC_URI` | `https://localhost:3449` | `https://design.lemo-design.com` | Origin loaded in the design webview |

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
