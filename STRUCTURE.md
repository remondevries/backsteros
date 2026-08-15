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
│       └── powersync-schema/   ← client SQLite schema
│
├── hub/                        ← macOS menu-bar start/stop for local services
├── mobile/                     ← Expo (iPhone + iPad, adaptive UI)
├── desktop/                    ← Tauri 2 + Vite/React (macOS)
│   └── packages/ui/            ← desktop-owned UI (not shared with mobile)
│
└── legacy/                     ← v1 snapshot — do not develop here
```

## Roles

| Path | Role |
| --- | --- |
| `core/server` | Business logic, Postgres, sync upload, OpenAPI |
| `core/packages/*` | Shared **non-UI** contracts between core and shells |
| `hub/` | Menu-bar control to start/stop Docker, core API, PTY |
| `mobile/` | Expo product shell |
| `desktop/` | Tauri product shell |
| `legacy/` | Frozen v1 apps (Next app/admin/development, sync-demo) |

## Runtime model

**Core** runs on a **local computer** (Postgres, files, API, PowerSync).  
**Hub** (menu bar) starts/stops that stack.  
**Shells** (mobile, desktop) talk to core over localhost / Tailscale.  
No shared visual UI package between mobile and desktop.
