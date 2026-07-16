# Legacy Circle reference

Path: `~/code/circle.remondevries.com`  
Production: https://circle.remondevries.com

**Do not extend Circle for BacksterOS features.** Use as migration reference and feature checklist only.

## What Circle is today

A single-repo monolith:

| Layer | Technology |
| --- | --- |
| Web | Next.js 16 App Router, server actions |
| Server DB | SQLite (`data/circle.db`) on Docker volume |
| Files | Local vault + DigitalOcean Spaces |
| Desktop | Tauri + **embedded Next.js Node sidecar** |
| iOS | Tauri iOS + Vite mobile SPA with Next.js shims |
| Deploy | Kamal on DO droplet (`209.38.44.246`) |
| Sync | Spaces change batches + `mobile_sync_events` + separate mobile API |

## Feature scope to carry forward

| Area | Carry forward? |
| --- | --- |
| Inbox, tasks, projects, contacts, organizations | Yes |
| Knowledge + project documents (markdown) | Yes |
| Journal | Yes |
| Letters (PDF) | Yes |
| WHOOP journal integration | Optional later |
| REST `/api/v1` + API keys | Yes — expand |
| Vault path / Spaces sync concept | Yes — simplify to Postgres + B2/R2 |
| Server actions as primary logic | **No** |
| Platform branching (`layout.mobile.tsx`, shims) | **No** |
| Tauri iOS | **No** — use Expo |
| Vite `mobile/` Next shims | **No** |
| SQLite on server | **No** — Postgres |
| Dual sync paths | **No** — unified PowerSync |

## Circle API endpoints (existing)

Documented in Circle `AGENTS.md`:

- `/api/v1` — projects, tasks, documents, knowledge, letters
- `/api/sync/*` — web/desktop sync
- `/api/mobile/v1/sync/*` — bootstrap, pull, push
- `/api/mobile/v1/session/*` — mobile auth

BacksterOS should **merge** mobile and web sync into one protocol.

## Circle mobile types (reference)

`lib/mobile-api/types.ts` — good starting point for sync payload shapes:

- `MobileBootstrapResponse`
- `MobilePullResponse` / `MobilePushRequest`
- `MobileMutation` with `changes[]`

Generalize to all clients, not mobile-only.

## Data migration (future)

1. Export SQLite → Postgres schema mapping
2. Copy Spaces bucket objects (or repoint to B2/R2)
3. Reindex Meilisearch from markdown/PDF text
4. Issue new API keys; retire Circle deploy when cutover complete

## Circle strengths to preserve

- Detailed `AGENTS.md` for programmatic access
- API key auth in Settings
- Letter PDF workflow with project assignment
- Keyboard-driven desktop UX (rebuild in new UI)

## Circle pain points (why BacksterOS exists)

- Four shells in one repo (web, desktop Tauri, iOS Tauri, Vite mobile)
- AI agents struggle with platform branching
- Business logic split across server actions, API routes, `lib/`
- Heavy desktop (Node sidecar)
- No unified bulk edit or live agent document sync
