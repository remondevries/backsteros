# Hybrid cloud-core + local-core

## Status

**Phase B live** (full workspace table twin + vault markdown) — code is ahead of older
“Phase A only” notes below. **Direction change (2026-08):** peer LWW twin is **not** the
end state. Target is Linear-shaped sync with **cloud-core as leader** and shells as caches —
see [`16-linear-shaped-sync.md`](16-linear-shaped-sync.md).

Live routes: `/internal/core-replication/*` (not the retired outbox paths).
`REPLICATED_TABLES` is the Phase B full twin set.

Earlier narrative (Phase A meeting booking MVP) remains historically true for the first
ship, but do not use this doc alone for replication correctness.

## Goals

| Goal | How |
| --- | --- |
| **Fast local desktop/mobile** | Shells keep using **local-core** + PowerSync + local vault |
| **Always-on portal** | **cloud-core** on a VPS serves external consumers when the laptop is off |
| **BacksterOS as portal foundation** | Full Tier A/B Postgres on cloud; portal filters what clients see |
| **Full API on cloud** | `sk_live_…` keys can access the full workspace API on cloud-core |
| **Markdown available offline from cloud** | Vault markdown replicated local → cloud |
| **PDFs local-primary** | PDF bytes stay on local vault; graceful API fallback when local is offline |

## Topology

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  External shells (always on)                                            │
│  · client portal (client.lemo-design.com) — separate repo, Kamal VPS     │
│  · future: more portal routes (projects, tasks, orgs, contacts)        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTPS → Portal API routes
                                │ (proxy or direct to cloud-core)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  cloud-core (VPS)                                                       │
│  · core/server (same codebase as local)                                 │
│  · PostgreSQL — full workspace Tier A/B replica                         │
│  · vault/markdown/ — replicated copy of markdown bodies                 │
│  · NO PDF bytes (letters) — metadata only                               │
│  · PowerSync optional (not used by portal)                              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ bidirectional HTTP replication (Phase A)
                                │ meeting_scheduling_settings, meetings, busy tasks
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  local-core (local computer — primary for you)                          │
│  · hub/ — Docker (Postgres + PowerSync) + API (:8788) + PTY (:3101)   │
│  · full vault (markdown + PDFs)                                       │
│  · agent Chat (ACP sidecar) — never on public cloud                   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ localhost / Tailscale
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Product shells (desktop, mobile)                                       │
│  · PowerSync → local-core only                                        │
│  · never depend on cloud-core for day-to-day work                       │
└─────────────────────────────────────────────────────────────────────────┘
```

## Roles

| Host | Primary consumers | When laptop is off |
| --- | --- | --- |
| **local-core** | Desktop, mobile, you, agents (via Tailscale) | Shells use cached SQLite; new writes queue locally |
| **cloud-core** | Client portal, public API keys, automation | Portal keeps working |

cloud-core is **not** a “backup mode” for desktop — it is the **always-on bridge**
to the internet. Desktop does not switch to cloud-core when local is down.

## Data on cloud-core

### Postgres (full Tier A/B replica — planned)

Replicate the **entire workspace** relational model to cloud-core, including
(not exhaustive — see [03-data-model.md](03-data-model.md)):

- tasks, projects, organizations, contacts, areas
- meetings, documents/letters **metadata**
- habits, bank accounts, financial categories/goals/recurrings
- workspace settings, mentions (Tier A/B per existing rules)

**Portal visibility** is **not** enforced by omitting rows from cloud. Use:

- portal-specific API routes and auth (client session, tenant scoping)
- optional flags (e.g. `portalVisible`, client org linkage) for convenient queries
- full `sk_live_…` API for owner/agents — unfiltered

Tier C (e.g. financial **transactions**) may live on cloud for API pagination;
sync policy TBD — transactions are server-primary today.

### Vault blobs

| Blob type | cloud-core | local-core | When local offline |
| --- | --- | --- | --- |
| **Markdown** (`.md`) | Replicated copy | Source + editor | `GET …/content` served from cloud |
| **PDF** (letters) | **Not stored** | Source | `GET …/pdf` → `503` / `pdf_requires_local_core` |
| Avatars / small `.backsteros/` blobs | Optional replicate | Source | Degrade or cache on cloud |

Markdown sync: local vault watcher → push creates/updates/deletes to cloud
filesystem (or object store on VPS). Conflict policy: **last-write-wins** on
`content_version` / `updated_at` unless local-core is online and wins ties.

### Never on cloud-core

- **PTY / Cursor ACP** agent processes ([12-v2-local-computer.md](12-v2-local-computer.md))
- Raw PDF letter bytes (by policy — see ADR-031)

## Write ownership (planned)

| Data | Primary writer | Sync direction |
| --- | --- | --- |
| Availability / scheduling settings | local-core (desktop calendar) | local → cloud |
| Portal meeting bookings | cloud-core | cloud → local |
| Tasks, projects, orgs (you) | local-core | local → cloud |
| Portal client actions (future) | cloud-core | cloud → local |

Conflict resolution: `updated_at` + entity version; retry with human merge for
rare collisions. Booking uses existing slot validation — cloud must see recent
busy intervals (meetings + timed tasks) before accepting a booking.

## API surfaces

### 1. Full internal / agent API (`sk_live_…`)

Same routes as today on whichever core is reachable. On cloud-core: full
workspace access for owner keys.

**Agents that must keep working when the laptop is offline must use cloud-core
as their API base URL** — never the Mac Tailscale IP / `127.0.0.1:8788`.

| Audience | Base URL |
| --- | --- |
| Always-on agents (Eva, Jaap, …) | `https://agent.backsteros.com` (door → cloud-core) or VPS `http://100.117.142.79:8788` |
| You / desktop / local agents with PTY | `http://127.0.0.1:8788` (local-core) |
| Core↔core replication peers | Tailscale core URLs only — **not** `agent.backsteros.com` / `agents.backsteros.com` |

**Verified ops (VPS):** `backsteros-agents` `.env` uses
`CORE_UPSTREAM_URL=http://127.0.0.1:8788` (switched off Mac Tailscale). A request
through the door appears in `docker logs cloud-backsteros-1`. Cursor/Grok agent
configs outside this repo should use the same public door — not Mac Tailscale.

Auth: `Authorization: Bearer sk_live_…` with the same keys on both cores (replicated).

### 2. Portal API (filtered)

Separate route namespace or middleware in the **portal repo** (or thin BFF on VPS):

- Client auth (e.g. Appwrite session) — **not** the owner `sk_live_…` key
- Row-level scoping (client sees only their org/projects/tasks)
- Never expose unfiltered internal API to portal end users

### 3. Public scheduling API (implemented today on local-core)

Already in `core/server` — moves to cloud-core when hybrid is built:

```http
GET  /api/v1/public/meeting-scheduling
GET  /api/v1/public/meeting-scheduling/slots
POST /api/v1/public/meeting-scheduling/bookings
```

Auth: `Authorization: Bearer sk_live_…` with `tasks:read` / `tasks:write`.
Portal proxies these via its own `/api/meeting/*` routes.

**Booking creates a `meetings` row** with title `Meeting with {name}`, summary
with booker email/note, schedule-derived status — syncs to local-core when
implemented.

## Current state (codebase today)

| Area | Status |
| --- | --- |
| local-core API, vault, PowerSync | **Implemented** — `core/server`, `hub/`, `deploy/` |
| Meetings + calendar UI | **Implemented** — desktop `calendar-page`, `meetings` table |
| Meeting scheduling settings | **Implemented** — `meeting_scheduling_settings`, weekday hours |
| Public scheduling routes | **Implemented** — `public-scheduling-routes.ts` |
| Client portal `/meeting` | **Implemented** — separate repo; proxies to cloud-core (Phase A) |
| cloud-core host | **Implemented** — `deploy/cloud/` Docker Compose on portal VPS |
| local ↔ cloud sync worker | **Implemented** — `core/server/src/services/core-replication/` |
| Full Tier A/B Postgres sync | **Planned** (Phase B) |
| Markdown vault replication | **Implemented** (Phase C — local→cloud `.md` on replication tick) |
| PDF offline fallback response | **Planned** (Phase C) |

`meeting_scheduling_settings` is **server-only** (not in PowerSync client schema);
desktop loads/patches via `GET/PATCH /api/v1/meeting-scheduling/settings`.

## Implementation phases (recommended)

### Phase A — cloud-core MVP ✅

- Deploy `core/server` + Postgres on VPS (`deploy/cloud/`)
- Bidirectional HTTP sync for: `meeting_scheduling_settings`, `meetings`, `tasks` (busy intervals)
- Portal `BACKSTEROS_API_URL` → cloud-core (`http://172.17.0.1:8788` on portal VPS)
- Local replication worker when `CORE_REPLICATION_ROLE=local`
- Bootstrap: `pnpm replication:bootstrap` (`CLOUD_DATABASE_URL`)

Env vars: `CORE_REPLICATION_ROLE`, `CORE_REPLICATION_PEER_URL`, `CORE_REPLICATION_SECRET`,
`CORE_REPLICATION_WORKSPACE_IDS`, `CORE_REPLICATION_INTERVAL_MS` (default 15000).
Internal routes: `POST/GET /api/v1/internal/replication/push|pull`.

### Phase B — full Tier A/B Postgres sync

- Replicate all PowerSync-published tables
- Portal: projects, orgs, contacts, tasks (read + scoped writes)
- Conflict policy + monitoring

### Phase C — markdown vault replication

- Sync `**/*.md` on the same replication tick as Postgres (`syncVaultWithPeer`
  when `CORE_REPLICATION_ROLE=local`): **pull** from cloud (LWW by `mtimeMs`) then
  **push** local changes — so docs created while the laptop is offline land on
  the Mac when it wakes
- Cloud serves vault apply/read routes only (does not push vault)
- Cloud serves `GET /documents/{id}/content` from the cloud vault copy
- `GET /letters/{id}/pdf` checks local reachability or returns structured error
- Internal routes: `PUT|DELETE|GET /internal/core-replication/vault/file`,
  `GET /internal/core-replication/vault/manifest`
- **Bootstrap / repair only:** [`deploy/cloud/sync-vault.sh`](../deploy/cloud/sync-vault.sh)
- Excludes PDFs and macOS AppleDouble (`._*`) junk

### Phase D — portal expansion

- Filtered portal routes per entity
- Optional `portalVisible` / tenant fields if query ergonomics need it

## Related repos

| Repo | Role |
| --- | --- |
| `~/code/backsteros/` | Core, desktop, mobile, hub, specs |
| `~/code/client.lemo-design.com/` | Client portal (Next.js, Kamal) — external shell |

Portal env: `BACKSTEROS_API_URL`, `BACKSTEROS_API_KEY` (server-only).

## Non-goals

- Running PTY/agents on cloud-core
- Bulk-syncing PDFs to VPS
- Desktop/mobile depending on cloud-core for sync
- Replacing local-core as the operator’s primary environment
