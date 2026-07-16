# Architecture

## System diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS (UI focus)                       │
├──────────────────┬──────────────────┬─────────────────────────────┤
│ Tauri (desktop)  │ Expo (iOS/Android)│ Browser (same web UI)    │
│ Vite + React     │ Expo Router       │ Vite + React              │
│ PowerSync Web    │ PowerSync RN      │ PowerSync Web             │
└────────┬─────────┴────────┬─────────┴───────────┬─────────────┘
         │                  │                     │
         └──────────────────┼─────────────────────┘
                            │
         ┌──────────────────▼──────────────────┐
         │  backsteros-api                        │
         │  Hono + ts-rest + OpenAPI              │
         │  • REST for portals & AI agents        │
         │  • Sync upload validation              │
         │  • Live document SSE/WebSocket         │
         │  • Search proxy → Meilisearch          │
         └──────────┬───────────────┬─────────────┘
                    │               │
    ┌───────────────▼───┐   ┌───────▼────────┐   ┌──────────────┐
    │ PowerSync Service │   │ PostgreSQL 17   │   │ Meilisearch  │
    │ partial sync rules│   │ metadata, sync  │   │ full-text    │
    └─────────┬─────────┘   └────────┬────────┘   └──────────────┘
              │                      │
              └──────────┬───────────┘
                         │
              ┌──────────▼──────────┐
              │ Backblaze B2 or R2  │
              │ PDFs + markdown body│
              └─────────────────────┘
```

## Design principle

> The product is the **data model + sync protocol**. Apps are views on top.

## Two access patterns, one backend

| Pattern | Consumers | Purpose |
| --- | --- | --- |
| **Sync** (PowerSync) | Expo, Tauri, web | Offline, bulk metadata, fast lists |
| **Content API** (OpenAPI REST) | AI agents, portals, scripts | Search, read/write bodies, batch ops |
| **Live channel** (SSE/WS in API) | Open document editors | Human + agent co-editing |

All paths write to the same Postgres rows and object storage keys.

## Repository layout

Single workspace: **`~/code/backsteros/`**

```text
backsteros/
├── docs/                      ← specs (this documentation)
├── backsteros-api/            ← backend service
├── backsteros-app/            ← product UI (/app, Tauri)
├── backsteros-admin/          ← ops dashboard (/admin)
├── backsteros-mobile/         ← Expo
├── backsteros-desktop/        ← Tauri shell → app
└── backsteros-packages/
    ├── api-client/            ← OpenAPI-generated client
    └── contracts/             ← Zod schemas
```

Folders exist; no application code until Phase 1. See [STRUCTURE.md](../STRUCTURE.md).

## What does NOT live in clients

- Business rules (validation, permissions, conflict policy)
- Postgres connections
- Meilisearch indexing
- Object storage credentials
- Sync event ordering

Clients hold: UI state, local SQLite cache (via PowerSync), optional small content cache for open files.

## Hosting (target)

| Component | Host |
| --- | --- |
| `backsteros-api` + PowerSync | VM (e.g. Kamal on DO droplet) or managed |
| PostgreSQL | **Neon** (prod); Docker Postgres (local dev) |
| Object storage | Backblaze B2 or Cloudflare R2 |
| Meilisearch | Sidecar on same VM or small dedicated instance |

## Auth model

| Audience | Mechanism |
| --- | --- |
| Human apps | **Clerk** session + device identity for sync |
| AI agents / portals | API keys `sk_live_…` with scopes (`documents:read`, `tasks:write`, …) |

## Write pipeline (all sources)

Every mutation — human sync push, agent REST PATCH, portal batch — must:

1. Update object storage (if body changed)
2. Update Postgres metadata + `version`
3. Append sync event (cursor +1)
4. Index Meilisearch (async ok)
5. Emit realtime event for subscribers

See [04-api-and-sync.md](04-api-and-sync.md).
