# BacksterOS — Agent entry point

Read this file first when working in **`~/code/backsteros/`**. Specs live at the repo root (`docs/`). Application code goes in **subfolders** below — not in `docs/`.

## Workspace root (v2)

```text
~/code/backsteros/
├── docs/                 ← specs
├── core/
│   ├── server/           ← API (Hono + Postgres + OpenAPI)
│   └── packages/         ← contracts, api-client, powersync-schema
├── hub/                  ← macOS menu-bar local service start/stop
├── mobile/               ← Expo (iPhone + iPad)
├── desktop/              ← Tauri 2 + Vite/React
└── legacy/               ← v1 snapshot (reference only)
```

See [STRUCTURE.md](STRUCTURE.md) and [docs/12-v2-local-computer.md](docs/12-v2-local-computer.md).

## Quick context

BacksterOS is a personal / company ops system:

- **Core** on a **local computer**: PostgreSQL + PowerSync + OpenAPI service + object/files storage
- **Shells:** Expo (mobile), Tauri + Vite/React (desktop)
- **Linear-style sync:** offline-first, cursor deltas, batch mutations
- **Agent-friendly API:** search, read/write markdown, lazy PDF fetch
- **API agents → cloud-core** (`https://agent.backsteros.com` + `sk_live_…`);
  desktop/mobile stay on local-core and receive cloud writes via replication
  nudge + workspace SSE (see `docs/13-hybrid-cloud-local-core.md`,
  `docs/04-api-and-sync.md` live documents)

Public Next.js product/admin and hosting portals are **out of scope** for active v2 work (see `legacy/`).

## Documentation map

Use [docs/llms.txt](docs/llms.txt) for the full index. Load **only** the files relevant to your task.

| Task | Read these docs |
| --- | --- |
| Starting any build work | `docs/00-vision.md`, `docs/01-architecture.md`, `docs/09-phased-build-plan.md`, `docs/12-v2-local-computer.md` |
| Choosing or changing tools | `docs/02-tech-stack.md`, `docs/10-decisions-log.md` |
| Database / entities / sync tiers | `docs/03-data-model.md` |
| API routes, sync, agent access | `docs/04-api-and-sync.md` (includes dual-hydrate) |
| Desktop / mobile shared pure logic | `docs/14-client-logic-inventory.md` |
| Desktop / mobile UI | `docs/05-clients.md`, `docs/07-performance.md` |
| PDFs, markdown bodies, search | `docs/06-storage-and-search.md` |

## Non-negotiable rules

1. **No Tier C/D bulk sync** — full markdown bodies and PDF bytes are never bootstrapped to clients by default. See `docs/03-data-model.md`.
2. **One source of truth** — Postgres (metadata) + object/file storage (blobs). Not two parallel sync systems.
3. **Business logic lives in `core/server/`** — not in shell apps or `docs/`.
4. **All writes pipeline** — storage → version bump → sync event → realtime push to open editors.
5. **Do not develop in `legacy/`** — copy into v2 paths when porting.
6. **No shared visual UI** between `mobile/` and `desktop/` — share contracts/api-client/schema only.
7. **Do not extend** `circle.remondevries.com` for new platform features.

## Subfolders (code)

| Path | Purpose |
| --- | --- |
| `core/server/` | Hono + Postgres + OpenAPI |
| `core/packages/contracts/` | Zod schemas + ts-rest contract |
| `core/packages/api-client/` | Typed HTTP client |
| `core/packages/powersync-schema/` | Shared PowerSync Tier A/B client schema |
| `mobile/` | Expo — Clerk + PowerSync |
| `desktop/` | Tauri 2 + Vite/React; desktop-owned UI under `desktop/packages/ui/` |
| `legacy/` | v1 Next apps, admin, development console, sync-demo |

## Phase gate

v2 foundation reorganizes around local-computer core + Expo + Tauri. Do not scaffold hosting portals or revive Next product web without explicit approval.

## Fetching doc content

Prefer loading by path:

```text
docs/04-api-and-sync.md
```

When answering architecture questions, cite the relevant doc section — do not rely on training data for stack choices.
