# BacksterOS — folder structure

Single workspace: **`~/BacksterOS/Projects/OS/Codebase/`** (branch `production`)

```text
~/BacksterOS/Projects/OS/Codebase/
├── AGENTS.md
├── README.md
├── STRUCTURE.md
├── docs/
├── deploy/
├── docker-compose.yml
│
├── core/
│   ├── server/                 ← Hono API (local computer)
│   └── packages/
│       ├── contracts/          ← Zod / OpenAPI shapes
│       ├── api-client/         ← typed HTTP client (shells only)
│       ├── cli/                ← `backsteros` CLI (tasks & projects)
│       └── powersync-schema/   ← client SQLite schema
│
├── mobile/                     ← Expo (iPhone + iPad, adaptive UI)
├── backsteros/                 ← Tauri 2 + Vite/React (macOS) — was desktop/
│   └── packages/ui/            ← desktop-owned UI (not shared with mobile)
├── agents/                     ← public HTTPS door (agent.backsteros.com)
├── backsterdev/                ← nested T3 Code monorepo (@t3tools/monorepo; own lockfile) — was development/
│   └── shim/                   ← README only (shim package removed in BDV-62)
├── backstermeet/               ← BacksterMeet — Tauri 2 Director (host) app for live meetings (@backsteros/meet)
├── backsterdesign/             ← BacksterDESIGN — nested Penpot fork (+ branding/, local devenv)
│   └── desktop/                ← Tauri 2 shell (@backsteros/design-desktop)
└── tooling/design/             ← @backsteros/design shim → proxies into backsterdesign/
```

v1 Next apps (app/admin/development/sync-demo) were moved out to
**`~/code/archive/backsteros-legacy/`** (2026-09-09) — not part of this workspace.

## Roles

| Path | Role |
| --- | --- |
| `core/server` | Business logic, Postgres, sync upload, OpenAPI |
| `core/packages/*` | Shared **non-UI** contracts between core and shells; `cli` is the agent/shell `backsteros` binary |
| `mobile/` | Expo product shell |
| `backsteros/` | Tauri product shell (package name `@backsteros/desktop`) |
| `agents/` | VPS agents door → cloud-core |
| `backsterdev/` | Nested T3 Code agent console with its own lockfile. Not a root workspace member, so root `pnpm typecheck` / `pnpm test` skip it: run `vp run -r typecheck` and `vp run -r test` inside `backsterdev/`. |
| `backsterdev/shim/` | README only. The `@backsteros/development` shim `package.json` was removed in BDV-62 (`72fdba7`); do not re-add it to `pnpm-workspace.yaml`. |
| `backstermeet/` | BacksterMeet — Tauri 2 + Vite/React **Director** host app for live meetings (package `@backsteros/meet`, dev port 1430). Guest side is the client portal; both join one LiveKit SFU. See `backstermeet/AGENTS.md` |
| `backsterdesign/` | BacksterDESIGN — vendored Penpot fork; `pnpm --filter @backsteros/design dev` → https://localhost:3449 |
| `backsterdesign/desktop/` | Tauri 2 shell — `pnpm --filter @backsteros/design-desktop tauri:dev` (needs `PENPOT_PUBLIC_URI`) |
| `tooling/design/` | Filter shim — `pnpm --filter @backsteros/design …` (includes `desktop` scripts) |

See [docs/20-repo-structure.md](docs/20-repo-structure.md) for the reorganization plan (`hub/` removed; `backsterdesign/` → `backsterdesign/` done).

## Runtime model

**Today:** local-core on this computer (Postgres, vault files, API, PowerSync). LaunchAgent / `BACKSTEROS_START_LOCAL_REPLICA=1` / desktop supervisor starts the optional replica. Desktop and mobile talk to it over localhost / Tailscale. PTY: `pnpm --filter @backsteros/desktop pty`.

**Target (ADR-035):** cloud-core is the center. iOS talks only to cloud-core. Local-core is the Mac replica for the desktop app. Shared files live in private R2; this computer keeps a working copy. See [docs/10-decisions-log.md](docs/10-decisions-log.md).

No shared visual UI package between mobile and desktop.
