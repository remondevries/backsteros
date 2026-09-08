# backsteros-desktop

Tauri 2 + Vite + React product client for macOS/Windows/Linux.

**Status:** Product UI via `@backsteros/ui` + local-core API/PowerSync.
Opens with local-shell bearer auth (no sign-in). GitHub commits/PRs use a
Settings PAT or `GITHUB_API_TOKEN` on local core.

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
| Auth | Local-shell bearer (`local`) |
| PDF | `react-pdf` + `pdfjs-dist` (workers copied to `public/`) |

## Develop

```bash
pnpm install
pnpm --filter @backsteros/ui build
cp desktop/.env.example desktop/.env
# Edit .env: VITE_API_URL=http://127.0.0.1:8788

# Recommended — menu-bar hub starts Docker + core API + PTY
pnpm --filter @backsteros/hub dev
# In the tray: Start all

# Then the product shell (from repo root or `cd desktop`)
pnpm --filter @backsteros/desktop dev
# Or Vite-only UI on :1420:
pnpm --filter @backsteros/desktop dev:vite
```

### Checks (CI `desktop` job runs the same)

```bash
pnpm --filter @backsteros/ui build        # desktop typecheck reads ui/dist
pnpm --filter @backsteros/ui typecheck
pnpm --filter @backsteros/desktop typecheck
pnpm --filter @backsteros/desktop lint    # eslint: react-hooks + typescript-eslint
pnpm --filter @backsteros/ui test         # node:test via tsx
pnpm --filter @backsteros/desktop test    # node:test via tsx (+ src/test/node-test-setup.mjs shim)
```

Tests are `node:test` + `node:assert/strict` (no vitest). UI tests import from
`src/`, never `dist/`. Do not let `tsc` emit `.js` next to `.ts` in
`packages/ui/src` — Vite resolves the `.js` first (gitignored as a guard).

Vite HMR can remount providers while PowerSync holds an IndexedDB SQLite handle. The desktop shell reuses that handle across Fast Refresh, surfaces a connect timeout as a recoverable error, and wraps the tree in an ErrorBoundary plus a boot-splash watchdog (Continue / Reload) so a bad hot update does not require killing the Tauri process.

Manual alternative (without hub):

```bash
# Terminal 1 — local core API
pnpm dev

# Terminal 2 — PTY sidecar (required for **mobile** Agent Chat over Tailscale)
pnpm --filter @backsteros/desktop pty

# Terminal 3 — desktop shell
pnpm --filter @backsteros/desktop dev
```

### Agents (desktop product decision)

Desktop no longer embeds Agent Chat / ACP. Use:

- **Grok Bot** (`agents/` → cloud-core) for always-on team bots
- **BacksterOS (development)** / T3 Code for interactive Cursor agents

Task list / status-bar presence still reflects Research and shared `agent-presence` (including T3). `agentChatId` remains on tasks for **mobile** Chat bindings.

### PTY sidecar (mobile Agent Chat)

Hub Start still runs the desktop package PTY sidecar (`ws` / HTTP on port 3101). Desktop Settings → Cursor → Agents can list/kill sessions. Desktop itself does not spawn ACP Chat.

- Default bind is loopback. For **iPad over Tailscale**:

```bash
PTY_HOST=0.0.0.0 PTY_AUTH_TOKEN=your-secret pnpm --filter @backsteros/desktop pty
```

  Set the same token on core (`AGENT_PTY_AUTH_TOKEN`) and `AGENT_PTY_PUBLIC_URL` to the Tailscale-reachable origin (e.g. `http://macbook.tailnet.ts.net:3101`). Desktop can set `VITE_PTY_AUTH_TOKEN` to match when auth is enabled.

### Cursor spellcheck

Under **Settings → Cursor**, paste a Cursor user API key, enable Spellcheck, and pick a model. The key is stored in core Postgres (not PowerSync). Task detail shows a **Spellcheck** button when the feature is on; preview and confirm before applying.

Under **Settings → Storage**, choose a local Obsidian-style vault folder on the machine running the API. Core creates `Journal/`, `Projects/`, `Letters/`, and `Knowledge Base/` automatically.

### Auth / API smoke

1. Start API locally (`8788`). Local-shell auth (`Bearer local`) is on by default
   for local-core — desktop opens straight into the workspace.
2. Optional: set `GITHUB_API_TOKEN` in `core/server/.env` (PAT with `repo`) or
   paste a token under Settings → GitHub.
3. Command palette (⌘K) uses live global search; lists use PowerSync local SQLite.

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

Connects via local-shell bearer on `GET /api/v1/powersync/token`. Tier A/B metadata syncs into local SQLite; Tier C/D bodies load on demand via REST.

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
