# BacksterOS — folder structure

Single workspace: **`~/code/backsteros/`** (branch `v2`)

```text
~/code/backsteros/
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

**Core** runs on a **local computer** (Postgres, files, API, PowerSync).  
**Hub** (menu bar) starts/stops that stack.  
**Shells** (mobile, desktop) talk to core over localhost / Tailscale.  
No shared visual UI package between mobile and desktop.
