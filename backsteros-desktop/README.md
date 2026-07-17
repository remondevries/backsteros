# backsteros-desktop

Tauri 2 + Vite + React product client for macOS/Windows/Linux.

**Status:** Not started — Phase 5 (scaffold when approved).

## Intent

- Native desktop shell that feels **lightweight and snappy** (PowerSync local
  metadata, remote API, no Tier C/D bulk sync).
- Product UI **very close or identical** to `backsteros-app` (the Next.js web
  product at `https://backsteros.com/app`).
- **Does not** embed or run the Next.js server / standalone build.
- **Separate from** `backsteros-mobile` (Expo) — shared API contracts only.

## Stack

| Layer | Choice |
| --- | --- |
| Shell | Tauri 2 |
| UI | Vite + React (SPA) |
| API | `https://service.backsteros.com` via `@backsteros/api-client` |
| Offline | PowerSync web SDK |
| Auth | Clerk (SPA / Tauri), same identity as web |

## Specs

- [`../docs/05-clients.md`](../docs/05-clients.md) — client surfaces
- [`../docs/10-decisions-log.md`](../docs/10-decisions-log.md) — **ADR-019**
- [`../docs/07-performance.md`](../docs/07-performance.md) — M1 / snappiness rules
- [`../docs/09-phased-build-plan.md`](../docs/09-phased-build-plan.md) — Phase 5
