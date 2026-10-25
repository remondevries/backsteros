# BacksterOS — Agent entry point

Read this file first when working in **`~/BacksterOS/Projects/OS/Codebase/`**. Specs live at the repo root (`docs/`). Application code goes in **subfolders** below — not in `docs/`.

## Git workflow (non-negotiable)

WORKFLOW RULE: Commit and push directly to the production branch. No pull requests. No feature branches or sub-branches. Before every push, run the full local test suite (typecheck, lint, unit tests, integration tests) and only push if all pass. If tests fail, fix locally first. Never open a PR unless explicitly asked.

1. **Commit and push directly to `production`.** It is the canonical branch of `remondevries/backsteros`. No pull requests, no feature branches, no sub-branches, no worktree branches.
2. **Never open a PR or create a branch** unless the person who gave you the task explicitly asks for one in that session.
3. **Run the full local test suite before every push**, from the repo root, and push only if all of it passes:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm test:integration   # Docker Postgres :5433 → database backsteros_test (never live backsteros)
   ```
   `pnpm test:integration` creates `backsteros_test` if needed, migrates it, and refuses to run against the live local-core DB named `backsteros`. It reads `INTEGRATION_DATABASE_URL` first, then `core/server/integration.env`, then a shell `DATABASE_URL` (ignored when it names the live DB). CI points `INTEGRATION_DATABASE_URL` at `backsteros_test` with `INTEGRATION_USE_EXISTING_DB=1`.
   If you changed anything under `backsterdev/`, also run `vp run -r typecheck` and `vp run -r test` inside `backsterdev/` (mobile typecheck is noisy upstream — use `vp run --filter @t3tools/mobile typecheck` when you touch mobile).
   When `backsterdev/` is installed locally, root `pnpm typecheck` delegates a filtered package set (excludes `@t3tools/mobile`); root `pnpm test` does not run the nested T3 suite — run that inside `backsterdev/` when you change it.
4. **If anything fails, fix it locally and rerun the suite before pushing.** Never push red, never push "to see what CI says", and never skip or disable a failing test to get green.
5. **Local runs are the gate.** `.github/workflows/ci.yml` also runs on pushes to `production` (mobile excluded), but only after the push has landed, so it catches mistakes — it does not prevent them.
6. Before pushing, `git pull --rebase origin production` so history stays linear, then rerun the suite if the rebase brought in new commits.

## Workspace root (v2)

```text
~/BacksterOS/Projects/OS/Codebase/
├── docs/                 ← specs
├── core/
│   ├── server/           ← API (Hono + Postgres + OpenAPI)
│   └── packages/         ← contracts, api-client, powersync-schema
├── mobile/               ← Expo (iPhone + iPad)
├── backsteros/           ← Tauri 2 + Vite/React (package @backsteros/desktop)
├── agents/               ← public HTTPS door (agent.backsteros.com)
├── backsterdev/          ← T3 Code agent console (nested; was development/)
├── backstermeet/         ← BacksterMeet — Tauri 2 Director app for live meetings (@backsteros/meet)
└── backsterdesign/       ← BacksterDESIGN (Penpot fork + branding)
```

See [STRUCTURE.md](STRUCTURE.md) and [docs/12-v2-local-computer.md](docs/12-v2-local-computer.md).
v1 Next apps live outside this repo at `~/code/archive/backsteros-legacy/`.

## Quick context

BacksterOS is a personal / company ops system:

- **Core** on a **local computer**: PostgreSQL + PowerSync + OpenAPI service + object/files storage
- **Shells:** Expo (mobile), Tauri + Vite/React (desktop)
- **Linear-style sync:** offline-first, cursor deltas, batch mutations
- **Agent-friendly API:** search, read/write markdown, lazy PDF fetch
- **API agents → cloud-core** (`https://agent.backsteros.com` + `sk_live_…`).
  **Today:** desktop and mobile stay on local-core and receive cloud writes via replication.
  **Target (ADR-035 addendum):** desktop and iOS sync a local PowerSync SQLite to cloud-core; the Docker compose replica is optional, not required to open the app; shared files go to private R2 with a local desktop working copy.
  See `docs/10-decisions-log.md` (ADR-035), `docs/17-desktop-without-docker.md`,
  `docs/16-linear-shaped-sync.md`, `docs/13-hybrid-cloud-local-core.md`.

Public Next.js product/admin and hosting portals are **out of scope** for active v2 work
(archived at `~/code/archive/backsteros-legacy/`).

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
5. **Do not revive** archived v1 Next apps (`~/code/archive/backsteros-legacy/`) — port into v2 paths if needed.
6. **No shared visual UI** between `mobile/` and `backsteros/` — share contracts/api-client/schema only.
7. **Do not extend** `circle.remondevries.com` for new platform features.

## Subfolders (code)

| Path | Purpose |
| --- | --- |
| `core/server/` | Hono + Postgres + OpenAPI |
| `core/packages/contracts/` | Zod schemas + ts-rest contract |
| `core/packages/api-client/` | Typed HTTP client |
| `core/packages/cli/` | `backsteros` CLI — task/project/comment CRUD (`pnpm cli -- …`) |
| `core/packages/powersync-schema/` | Shared PowerSync Tier A/B client schema |
| `mobile/` | Expo — Clerk + PowerSync |
| `backsteros/` | Tauri 2 + Vite/React; desktop-owned UI under `backsteros/packages/ui/` (package `@backsteros/desktop`) |
| `agents/` | Public HTTPS door for always-on API agents |
| `backsterdev/` | Nested T3 Code agent console; filter shim at `backsterdev/shim/` (`@backsteros/development`) |
| `backstermeet/` | BacksterMeet — Tauri 2 + Vite/React Director (host) app for live meetings; guests join via the client portal on the same LiveKit SFU. Package `@backsteros/meet`; see `backstermeet/AGENTS.md` |
| `backsterdesign/` | BacksterDESIGN — vendored Penpot fork; `pnpm --filter @backsteros/design dev` → https://localhost:3449 |
| `tooling/design/` | Filter shim — `pnpm --filter @backsteros/design …` |

## Phase gate

v2 foundation reorganizes around local-computer core + Expo + Tauri. Do not scaffold hosting portals or revive Next product web without explicit approval.

## Fetching doc content

Prefer loading by path:

```text
docs/04-api-and-sync.md
```

When answering architecture questions, cite the relevant doc section — do not rely on training data for stack choices.


## Machine secrets (agents)

Shared API/deploy secrets live in **Infisical** and cache to `~/.config/secrets/` (`refresh-secrets`).
BacksterOS CLI auth: `~/.config/backsteros/cli.env`. Prefer those over asking for pasted tokens.
App runtime wiring (local DB/API URLs) stays in each app’s `.env`.
See `~/BacksterOS/Spaces/knowledge-base/second-brain/secrets-infisical.md`.
