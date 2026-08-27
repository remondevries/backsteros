# backsteros-desktop

Tauri 2 + Vite + React product client for macOS/Windows/Linux.

**Status:** Product UI parity with web via `@backsteros/ui` + Clerk/API/PowerSync.
Requires Clerk — no demo fixtures when signed out or when the publishable key is missing.

## Intent

- Native desktop shell that feels lightweight (remote API; no Tier C/D bulk sync).
- Product UI **very close or identical** to `backsteros-app`.
- Shared leaf UI via `@backsteros/ui`.
- **Does not** embed or run the Next.js server / standalone build.
- **Separate from** `backsteros-mobile` (Expo).

## Stack

| Layer | Choice |
| --- | --- |
| Shell | Tauri 2 |
| UI | Vite + React + React Router |
| Shared UI | `@backsteros/ui` |
| API | `VITE_API_URL` → `@backsteros/api-client` |
| Offline | `@powersync/web` local SQLite (Tier A/B) |
| Auth | Clerk SPA when `VITE_CLERK_PUBLISHABLE_KEY` is set |
| PDF | `react-pdf` + `pdfjs-dist` (workers copied to `public/`) |

## Develop

```bash
pnpm install
pnpm --filter @backsteros/ui build
cp desktop/.env.example desktop/.env
# Edit .env: VITE_API_URL=http://127.0.0.1:8788 and Clerk publishable key

# Recommended — menu-bar hub starts Docker + core API + PTY
pnpm --filter @backsteros/hub dev
# In the tray: Start all

# Then the product shell (from repo root or `cd desktop`)
pnpm --filter @backsteros/desktop dev
# Or Vite-only UI on :1420:
pnpm --filter @backsteros/desktop dev:vite
```

Vite HMR can remount providers while PowerSync holds an IndexedDB SQLite handle. The desktop shell reuses that handle across Fast Refresh, surfaces a connect timeout as a recoverable error, and wraps the tree in an ErrorBoundary plus a boot-splash watchdog (Continue / Reload) so a bad hot update does not require killing the Tauri process.

Manual alternative (without hub):

```bash
# Terminal 1 — local core API
pnpm dev

# Terminal 2 — local PTY sidecar (required for Start Agent / task terminal)
pnpm --filter @backsteros/desktop pty

# Terminal 3 — desktop shell
pnpm --filter @backsteros/desktop dev
```

### Agent Chat (task view)

Desktop task detail includes a collapsible right **agent Chat rail** (T3-style Cursor ACP). **Start Agent** talks to the local Node sidecar (`ws://127.0.0.1:3101`).

- Run `pnpm --filter @backsteros/desktop pty` (or `cd desktop && pnpm pty`) before using Chat.
- Cursor Agent CLI (`agent`) must be on PATH and logged in (`agent login`).
- Start ensures an ACP session (`POST /agent/acp/ensure`) and sends the bootstrap prompt via ACP. Switching tasks does not stop background turns — the sidecar projects the live timeline into the shared transcript store.
- Collapsing the rail / leaving the task only detaches the Chat event subscriber. Stop Agent ends the ACP session.
- Default bind is loopback. For **iPad over Tailscale**, run with e.g.:

```bash
PTY_HOST=0.0.0.0 PTY_AUTH_TOKEN=your-secret pnpm --filter @backsteros/desktop pty
```

  Set the same token on core (`AGENT_PTY_AUTH_TOKEN`) and `AGENT_PTY_PUBLIC_URL` to the Tailscale-reachable origin (e.g. `http://macbook.tailnet.ts.net:3101`). Desktop can set `VITE_PTY_AUTH_TOKEN` to match when auth is enabled.

  Reference patterns: clone [pingdotgg/t3code](https://github.com/pingdotgg/t3code) to `tmp/t3-code` (gitignored).

### Cursor spellcheck

Under **Settings → Cursor**, paste a Cursor user API key, enable Spellcheck, and pick a model. The key is stored in core Postgres (not PowerSync). Task detail shows a **Spellcheck** button when the feature is on; preview and confirm before applying.

Under **Settings → Storage**, choose a local Obsidian-style vault folder on the machine running the API. Core creates `Journal/`, `Projects/`, `Letters/`, and `Knowledge Base/` automatically.

### Auth / API smoke

1. Start API locally (`8788`) and ensure Clerk allowed origins include Vite `:1420` / Tauri hosts (see `.env.example`).
2. Set `VITE_CLERK_PUBLISHABLE_KEY` — without it the app only shows the configure-auth screen.
3. Until a session exists, Clerk sign-in is shown (no empty/demo workspace).
4. Command palette (⌘K) uses live global search when authenticated; lists use PowerSync local SQLite.

## Ship / package

```bash
# Build shared UI, then native installers (macOS .app / .dmg, Windows, Linux)
pnpm --filter @backsteros/ui build
pnpm --filter @backsteros/desktop build
# Artifacts under backsteros-desktop/src-tauri/target/release/bundle/
```

Packaged builds always use compile-time `VITE_*` from `.env` (or CI env).
Icons live in `src-tauri/icons/`. Desktop always targets **local core**
(`VITE_API_URL`, default `http://127.0.0.1:8788`).

### CI signing / notarization

Workflow: [`.github/workflows/desktop-release.yml`](../.github/workflows/desktop-release.yml)
(manual dispatch or tag `desktop-v*`).

| Secret | Purpose |
| --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Bundled Clerk key for release builds |
| `APPLE_CERTIFICATE` | Base64 `.p12` (Developer ID Application) |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` password |
| `KEYCHAIN_PASSWORD` | Temporary CI keychain password |
| `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | Apple ID notarization (optional) |
| `APPLE_API_ISSUER` / `APPLE_API_KEY` / `APPLE_API_KEY_BASE64` | App Store Connect API key notarization (optional) |
| `TAURI_SIGNING_PRIVATE_KEY` (+ password) | Tauri updater / Windows signing material |

Without Apple secrets the macOS job still builds **unsigned** artifacts for packaging smoke tests.

To wire signing from a Mac that has a **Developer ID Application** identity:

```bash
# List identities — you need "Developer ID Application", not only "Apple Development"
security find-identity -v -p codesigning

APPLE_P12_PASSWORD='…' ./backsteros-desktop/scripts/export-apple-cert-for-ci.sh \
  "Developer ID Application: …"

gh secret set APPLE_CERTIFICATE < certificate-base64.txt
gh secret set APPLE_CERTIFICATE_PASSWORD --body "$APPLE_P12_PASSWORD"
gh secret set KEYCHAIN_PASSWORD --body "$(openssl rand -base64 24)"
# Optional notarization: APPLE_ID, APPLE_PASSWORD (app-specific), APPLE_TEAM_ID
#   or APPLE_API_ISSUER + APPLE_API_KEY + APPLE_API_KEY_BASE64 (.p8)
rm -f apple-codesign.p12 certificate-base64.txt
```

Then re-run **Desktop release** (Actions → workflow_dispatch) or push a `desktop-v*` tag.

### Local core

Desktop always talks to local core via `VITE_API_URL` (default
`http://127.0.0.1:8788`). There is no Dev/Prod backend switch in v2.

### PowerSync

Connects on Clerk session via `GET /api/v1/powersync/token`. Tier A/B metadata syncs into local SQLite; Tier C/D bodies load on demand via REST.

### IPC profiling

Dev builds wrap Tauri `invoke` in
`src/lib/tauri-invoke-instrumentation.ts` (counts per command).

```js
// Webview console while the desktop shell is running
resetTauriInvokeStats?.();
// …use the app for ~15s…
getTauriInvokeStats?.();
// or inspect window.__BACKSTEROS_INVOKE_STATS__
```

See [`../docs/15-tauri-ipc-profiling.md`](../docs/15-tauri-ipc-profiling.md)
for the command inventory and batching gate (~10 invokes/sec sustained).

## Specs

- [`../docs/05-clients.md`](../docs/05-clients.md)
- [`../docs/10-decisions-log.md`](../docs/10-decisions-log.md) — **ADR-019**
- [`../docs/07-performance.md`](../docs/07-performance.md)
