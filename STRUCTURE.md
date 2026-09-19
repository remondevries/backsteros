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
├── hub/                        ← macOS menu-bar start/stop for local services
├── mobile/                     ← Expo (iPhone + iPad, adaptive UI)
├── desktop/                    ← Tauri 2 + Vite/React (macOS)
│   └── packages/ui/            ← desktop-owned UI (not shared with mobile)
├── agents/                     ← public HTTPS door (agent.backsteros.com)
├── development/                ← nested T3 Code monorepo (@t3tools/monorepo; own lockfile)
└── tooling/development/        ← @backsteros/development shim → proxies into development/
```

v1 Next apps (app/admin/development/sync-demo) were moved out to
**`~/code/archive/backsteros-legacy/`** (2026-09-09) — not part of this workspace.

## Roles

| Path | Role |
| --- | --- |
| `core/server` | Business logic, Postgres, sync upload, OpenAPI |
| `core/packages/*` | Shared **non-UI** contracts between core and shells; `cli` is the agent/shell `backsteros` binary |
| `hub/` | Menu-bar control to start/stop Docker, core API, PTY |
| `mobile/` | Expo product shell |
| `desktop/` | Tauri product shell |
| `agents/` | VPS agents door → cloud-core |
| `development/` | Nested T3 Code agent console (not a root workspace member) |
| `tooling/development/` | Filter shim — `pnpm --filter @backsteros/development …` |

## Runtime model

**Today:** local-core on this computer (Postgres, vault files, API, PowerSync). Hub starts and stops that stack. Desktop and mobile talk to it over localhost / Tailscale.

**Target (ADR-035):** cloud-core is the center. iOS talks only to cloud-core. Local-core is the Mac replica for the desktop app. Shared files live in private R2; this computer keeps a working copy. See [docs/10-decisions-log.md](docs/10-decisions-log.md).

No shared visual UI package between mobile and desktop.
