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
| Offline | `@powersync/web` (REST fallback if SQLite/WASM fails) |
| Auth | Clerk SPA when `VITE_CLERK_PUBLISHABLE_KEY` is set |
| PDF | `react-pdf` + `pdfjs-dist` (workers copied to `public/`) |

## Develop

```bash
pnpm install
pnpm --filter @backsteros/ui build
cp backsteros-desktop/.env.example backsteros-desktop/.env
# Edit .env: VITE_API_URL=http://127.0.0.1:8787 and Clerk publishable key
pnpm --filter @backsteros/desktop tauri:dev
# Or Vite-only UI on :1420:
pnpm --filter @backsteros/desktop dev
```

### Auth / API smoke

1. Start API locally (`8787`) and ensure Clerk allowed origins include Vite `:1420` / Tauri hosts (see `.env.example`).
2. Set `VITE_CLERK_PUBLISHABLE_KEY` — without it the app only shows the configure-auth screen.
3. Until a session exists, Clerk sign-in is shown (no empty/demo workspace).
4. Command palette (⌘K) uses live global search when authenticated; tasks/projects/letters prefer PowerSync then REST.

## Ship / package

```bash
# Build shared UI, then native installers (macOS .app / .dmg, Windows, Linux)
pnpm --filter @backsteros/ui build
pnpm --filter @backsteros/desktop tauri:build
# Artifacts under backsteros-desktop/src-tauri/target/release/bundle/
```

Packaged builds always use compile-time `VITE_*` from `.env` (or CI env). Dev/Prod
toggle is Vite/`tauri dev` only. Icons live in `src-tauri/icons/`.

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

### Dev ↔ Prod backend (Vite / `tauri dev` only)

Settings → Sync exposes a **Dev / Prod** toggle (same as the Next.js app). Selection is stored in `localStorage` and reloads the app so the API client and PowerSync SQLite file (`backsteros-desktop-{dev|prod}-{user}.db`) stay aligned. Packaged builds always use `VITE_API_URL`.

### PowerSync

Connects on Clerk session via `GET /api/v1/powersync/token`. If WASM/OPFS init fails in the WebView, lists fall back to REST (`docs/10-decisions-log.md` ADR-019).

## Specs

- [`../docs/05-clients.md`](../docs/05-clients.md)
- [`../docs/10-decisions-log.md`](../docs/10-decisions-log.md) — **ADR-019**
- [`../docs/07-performance.md`](../docs/07-performance.md)
