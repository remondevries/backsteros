# Clients

## Active surfaces (v2)

| Surface | Folder | How you reach it | Role |
| --- | --- | --- | --- |
| **Desktop** | `desktop/` | Tauri app → local-core `http://127.0.0.1:8788` | Day-to-day product UI |
| **Mobile** | `mobile/` | Expo (iPhone / iPad) → local-core | Same product concepts; native layouts |
| **Hub** | `hub/` | macOS menu bar | Start/stop Docker, core, PTY |
| **CLI** | `core/packages/cli/` | `pnpm cli -- …` | Task/project/comment CRUD |
| **API agents** | (external) | `https://agent.backsteros.com` + `sk_live_…` | Always-on writes via cloud-core door |

See [11-urls-and-routing.md](11-urls-and-routing.md), [12-v2-local-computer.md](12-v2-local-computer.md),
[13-hybrid-cloud-local-core.md](13-hybrid-cloud-local-core.md). Desktop decision: ADR-019.

## Desktop — Tauri (`desktop/`)

**Stack:** Tauri 2 + Vite + React SPA. Talks to **local-core** only for day-to-day work
(PowerSync + REST). Does **not** load a Next.js build.

```text
desktop/
  src/                 Vite + React product UI
  src-tauri/           Rust shell
  packages/ui/         desktop-owned UI (not shared with mobile)
```

### Separate from mobile

Desktop is **not** Expo. Share **non-UI** packages only (`api-client`, `contracts`,
`powersync-schema`). No shared visual UI — see [14-client-logic-inventory.md](14-client-logic-inventory.md).

### Offline and performance

- Lists/tasks via local SQLite (PowerSync)
- Document/PDF: fetch on open, discard on leave
- See [07-performance.md](07-performance.md)

## Mobile — Expo (`mobile/`)

- Product experience only
- Expo Router + PowerSync RN
- Separate framework from desktop (ADR-004 / ADR-019)

## Always-on agents

Agents do **not** use the desktop/mobile shells. They call cloud-core through the
public door:

```text
https://agent.backsteros.com/api/v1  +  Authorization: Bearer sk_live_…
```

Proxy code: `agents/`. Upstream: VPS cloud-core `:8788`. See `agents/README.md`.

## Client portal (separate repo)

`client.lemo-design.com` is **not** in this monorepo. It talks to cloud-core on the
same VPS (`BACKSTEROS_API_URL` → Docker network / `:8788`).

## Retired (v1 — do not extend)

| Surface | Was | Now |
| --- | --- | --- |
| Product web | `backsteros.com/app` (Next.js) | **410 Gone** — archived at `~/code/archive/backsteros-legacy/backsteros-app/` |
| Ops admin | `backsteros.com/admin` | **410 Gone** — archived at `~/code/archive/backsteros-legacy/backsteros-admin/` |
| Cloud API | `service.backsteros.com` | **410 Gone** |
| Cloud PowerSync | `sync.backsteros.com` | **410 Gone** |
| Legacy subdomain | `app.backsteros.com` | **410 Gone** |

Active work is `core/`, `desktop/`, `mobile/`, `hub/`, `agents/`. v1 Next trees are outside this repo.
