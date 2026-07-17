# backsteros-desktop

Tauri 2 + Vite + React product client for macOS/Windows/Linux.

**Status:** Scaffolded — Phase 5 foundation (ADR-019).

## Intent

- Native desktop shell that feels lightweight (PowerSync local metadata later;
  remote API; no Tier C/D bulk sync).
- Product UI **very close or identical** to `backsteros-app`.
- **Does not** embed or run the Next.js server / standalone build.
- **Separate from** `backsteros-mobile` (Expo).

## Stack

| Layer | Choice |
| --- | --- |
| Shell | Tauri 2 |
| UI | Vite + React (SPA) |
| API | `VITE_API_URL` → `@backsteros/api-client` |
| Offline | PowerSync web SDK (not wired yet) |
| Auth | Clerk SPA (not wired yet) |

## Develop

From the workspace root (recommended):

```bash
pnpm install
cp backsteros-desktop/.env.example backsteros-desktop/.env
pnpm --filter @backsteros/desktop tauri:dev
```

Vite-only (no native window):

```bash
pnpm --filter @backsteros/desktop dev
```

## Specs

- [`../docs/05-clients.md`](../docs/05-clients.md)
- [`../docs/10-decisions-log.md`](../docs/10-decisions-log.md) — **ADR-019**
- [`../docs/07-performance.md`](../docs/07-performance.md)
- [`../docs/09-phased-build-plan.md`](../docs/09-phased-build-plan.md) — Phase 5
