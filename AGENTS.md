# BacksterOS — Agent entry point

Read this file first when working in **`~/code/backsteros/`**. Specs live at the repo root (`docs/`). Application code goes in **subfolders** below — not in `docs/`.

## Workspace root

```text
~/code/backsteros/
├── docs/                      ← specs
├── backsteros-api/            ← backend (service.backsteros.com)
├── backsteros-app/            ← product UI (backsteros.com/app, Tauri)
├── backsteros-admin/          ← ops dashboard (backsteros.com/admin)
├── backsteros-mobile/         ← Expo (product)
├── backsteros-desktop/        ← Tauri → app build
└── backsteros-packages/
```

See [STRUCTURE.md](STRUCTURE.md) and [docs/11-urls-and-routing.md](docs/11-urls-and-routing.md).

## Quick context

BacksterOS replaces the Circle monolith (`~/code/circle.remondevries.com`) with:

- **Thin clients:** Expo (mobile), Tauri + Vite/React (desktop), browser (same web UI)
- **Central backend:** PostgreSQL + PowerSync + OpenAPI service + object storage + Meilisearch
- **Linear-style sync:** offline-first, cursor deltas, batch mutations, realtime on open documents
- **Agent-friendly API:** search, read/write markdown, lazy PDF fetch — same data as human apps

## Documentation map

Use [docs/llms.txt](docs/llms.txt) for the full index. Load **only** the files relevant to your task.

| Task | Read these docs |
| --- | --- |
| Starting any build work | `docs/00-vision.md`, `docs/01-architecture.md`, `docs/09-phased-build-plan.md` |
| Choosing or changing tools | `docs/02-tech-stack.md`, `docs/10-decisions-log.md` |
| Database / entities / sync tiers | `docs/03-data-model.md` |
| API routes, sync, agent access | `docs/04-api-and-sync.md` |
| Desktop / mobile / web UI | `docs/05-clients.md`, `docs/11-urls-and-routing.md`, `docs/07-performance.md`, `docs/10-decisions-log.md` (ADR-019 desktop) |
| PDFs, markdown bodies, search | `docs/06-storage-and-search.md` |
| Migrating from Circle | `docs/08-legacy-circle.md` |
| Human + agent co-editing markdown | `docs/04-api-and-sync.md` § Live documents |

## Non-negotiable rules

1. **No Tier C bulk sync** — full markdown bodies and PDF bytes are never bootstrapped to clients by default. See `docs/03-data-model.md`.
2. **One source of truth** — Postgres (metadata) + object storage (blobs). Not two parallel sync systems.
3. **Business logic lives in `backsteros-api/`** — not in UI repos or `docs/`.
4. **All writes pipeline** — storage → version bump → sync event → realtime push to open editors.
5. **Do not extend** `circle.remondevries.com` for new platform features.

## Subfolders (code — not started)

| Path (under `backsteros/`) | Status | Purpose |
| --- | --- | --- |
| `backsteros-api/` | Phase 1 — local dev working | Hono + Postgres + OpenAPI |
| `backsteros-packages/contracts/` | Phase 1 — done | Zod schemas + ts-rest contract |
| `backsteros-packages/api-client/` | Empty — Phase 1+ | Generated HTTP client |
| `backsteros-admin/` | Empty — Phase 3b | Ops UI at `/admin` — logs, sync |
| `backsteros-mobile/` | Empty — Phase 4 | Expo product app (not Tauri) |
| `backsteros-app/` | Phase 5 — in progress | Product web at `/app` (Next.js) |
| `backsteros-desktop/` | Empty — Phase 5 | Tauri 2 + Vite/React; UI ≈ web (ADR-019) |

Do not put application code in `docs/` or loose at the workspace root — use the subfolder for each layer.

## Phase gate

Phase 1 scaffold is in progress. Do not start Phase 2+ without explicit user approval (`docs/09-phased-build-plan.md`).

## Fetching doc content

Prefer loading by path:

```text
docs/04-api-and-sync.md
```

When answering architecture questions, cite the relevant doc section — do not rely on training data for stack choices.
