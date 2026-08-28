# API and sync

## Overview

Three surfaces on one backend:

1. **PowerSync** — apps (offline, local SQLite, partial sync)
2. **REST / OpenAPI** — agents, portals, automation
3. **Live documents** — SSE/WebSocket for open-file collaboration

## Sync API (apps) — **DEAD (quarantined)**

> **Do not build new clients against these.** Active upload path is
> PowerSync → `POST /api/v1/powersync/write`. The endpoints below remain
> registered for legacy storage-health probes only (`sync-routes.ts`).

### Bootstrap (scoped) — DEAD

```http
POST /api/v1/sync/bootstrap
```

Returns: `schema_version`, `cursor`, snapshot of Tier A + B entities per sync rules, `spaces_configured` flag.

Does **not** include Tier D bodies.

### Pull deltas — DEAD

```http
GET /api/v1/sync/pull?cursor={n}
```

Returns: `events[]`, `has_more`, new `cursor`.

### Push mutations (batch) — DEAD

```http
POST /api/v1/sync/push
```

```json
{
  "schema_version": 1,
  "device_id": "uuid",
  "mutations": [{
    "id": "mutation-uuid",
    "changes": [
      { "entity": "task", "entity_id": "t1", "operation": "upsert", "payload": { "status": "done" }, "updated_at": 1710000000000 }
    ]
  }]
}
```

Supports **bulk edit**: many changes in one mutation, one DB transaction server-side.

Response: `accepted_mutation_ids`, new `cursor`.

### Realtime hint (optional) — not wired for apps

```http
GET /sync/stream
```

SSE: `{ "cursor": 4821 }` — client calls `pull` when cursor advances.

## REST API v1 (agents + portals)

Base: `http://127.0.0.1:8788/api/v1` (or Tailscale MagicDNS to the local computer)

Auth: `Authorization: Bearer sk_live_…`

### Read / search (agents)

```http
GET  /api/v1/search?q=architecture&type=document
GET  /api/v1/projects
GET  /api/v1/tasks
GET  /api/v1/documents/{id}
GET  /api/v1/documents/{id}/content
GET  /api/v1/letters/{id}
GET  /api/v1/letters/{id}/pdf          → redirect or presigned URL
```

### Write (agents)

```http
PATCH /api/v1/documents/{id}/content
POST  /api/v1/tasks/batch
PATCH /api/v1/tasks/{id}
```

Every write runs the **unified write pipeline** (storage → Postgres → sync event → Meilisearch → realtime).

### OpenAPI

- Generated from ts-rest / Zod contracts in `packages/contracts`
- Published at `/api/v1/openapi.json`
- `packages/api-client` generated for all UI repos

## API key scopes (planned)

| Scope | Allows |
| --- | --- |
| `projects:read` | List/read projects |
| `tasks:read` / `tasks:write` | Task CRUD + batch |
| `documents:read` / `documents:write` | Markdown metadata + content |
| `letters:read` | Letter metadata + PDF access |
| `finance:read` / `finance:write` | Bank accounts, categories, transaction list/import/classification |
| `search:query` | Meilisearch proxy |

### Finance (Tier C ledger)

```http
GET    /api/v1/bank-accounts
POST   /api/v1/bank-accounts
GET    /api/v1/bank-accounts/{id}/transactions?q=&month=&cursor=
POST   /api/v1/bank-accounts/{id}/imports   # CSV body + X-Filename
PATCH  /api/v1/transactions/{id}           # classification only
POST   /api/v1/transactions/batch
GET    /api/v1/financial-categories
```

Transactions are **not** PowerSynced. Bank accounts and categories are Tier A.

## Live documents (human + agent)

When user opens a document in CodeMirror:

1. UI `POST /api/v1/documents/{id}/subscribe` (or WebSocket join `doc:{id}`)
2. Server tracks open sessions
3. Agent `PATCH /api/v1/documents/{id}/content` → server writes body, bumps `content_version`
4. Server emits `{ type: "document.updated", id, version, patch_or_url }`
5. Editor applies update within ~0.2–2 s

### Conflict policy (v1)

| Situation | Behavior |
| --- | --- |
| User idle, agent writes | Auto-refresh editor content |
| User typing, agent writes | Toast: “Agent updated — review?” or queue until save |
| Both offline | Sync pull on reconnect |

### Levels of collaboration

| Level | Description | Target |
| --- | --- | --- |
| 1 | Whole-file replace on save | Phase 1 |
| 2 | Live session + version + subscribe | Phase 2 (agent + human goal) |
| 3 | CRDT / Yjs character-level | Not v1 |

## PowerSync upload path

Client writes locally → PowerSync queue → `uploadData` → `POST /api/v1/powersync/write` → same domain functions as REST → Postgres → replication back to clients.

**One implementation** of business logic; REST is a thin wrapper for external callers (agents) and for the **sole dual-write exception** below.

### Client write gate

When PowerSync is `ready && connected`, desktop/mobile `*ViaPowerSyncOrApi` helpers skip REST (`shouldSkipRestEntityWrite`).

**Sole REST dual-write exception:** `taskPatchRequiresRestWrite` — `agentInboxApproved: true` only. Stamps Postgres immediately so a racing pull cannot clear the local inbox sign-off before the PowerSync upload ack. Do not add further exceptions; fix upload/replication races instead. See `@backsteros/contracts` `inbox-updated.ts`.

## Circle API reference

Legacy endpoints documented in `~/code/circle.remondevries.com/AGENTS.md` (`/api/v1`, `/api/mobile/v1/sync/*`). BacksterOS unifies mobile and web sync into one protocol.

## Desktop / mobile dual-hydrate (REST + PowerSync) — **deprecated**

> **Revoked as product strategy.** Target is Linear-shaped sync: local SQLite reads, optimistic mutations, server total order — see [`16-linear-shaped-sync.md`](16-linear-shaped-sync.md). Dual-hydrate (`mergeLocalAndApiByUpdatedAt`) is being removed from desktop; do not extend it.

Historical context (why it existed): packaged desktop could report PowerSync `ready` with empty SQLite when the download stream never connected (WKWebView + Tailscale). REST list hydrate filled Projects/Tasks/Inbox from Postgres as a rescue. That rescue is **not** the long-term design.

### Legacy wave table (being retired)

| Wave | Entities | When |
| --- | --- | --- |
| 1 | Tasks, inbox tasks, projects | Immediately on auth — flips `restHydrateSettled` |
| 2 | Documents, areas, orgs, contacts, letters, habits, meetings | `requestIdleCallback` (or timeout fallback) after wave 1 |

Former implementation: [`desktop/src/lib/workspace/use-workspace-api-rows.ts`](../desktop/src/lib/workspace/use-workspace-api-rows.ts), [`merge-local-and-api.ts`](../desktop/src/lib/merge-local-and-api.ts). Mobile list hydrate is cold-start / offline-only via [`mobile/lib/use-rest-list-hydration.ts`](../mobile/lib/use-rest-list-hydration.ts) + [`rest-list-hydration-policy.ts`](../mobile/lib/rest-list-hydration-policy.ts) — no REST refetch or field-merge over local rows while PowerSync is connected and SQLite has rows.

### Merge rules

- Winner: newer `updatedAt` (see [`desktop/src/lib/merge-local-and-api.ts`](../desktop/src/lib/merge-local-and-api.ts)).
- `preservePendingApiRows` keeps optimistic creates that have not landed in SQLite yet.
- Column fillers (`fillMissingLinksFromApi`, long text, due dates, …) copy API fields when local won on timestamp but still omits a column (stale schema / partial sync).

### Failure modes

| Local SQLite | REST | UX |
| --- | --- | --- |
| Empty | OK | Lists fill from REST; `source` may still flip to `powersync` once any watch returns |
| OK | Fail | PowerSync-only; soft revalidate retries later |
| Both stale | — | User sees last merged snapshot; next sync/hydrate refreshes |

### Debugging

- `workspace.source` — `"powersync"` once a local tasks watch has rows, else `"empty"`
- `workspace.ready` — combines PowerSync readiness, REST settle, and a **12s** `queriesGracePeriodExpired` so cold start is not blocked forever on a hung watch
- Prefer React Profiler on a single task status patch when changing merge or watch code

### Client logic sharing

Mirrored pure helpers (due filters, inbox attention, …) are inventoried in [`docs/14-client-logic-inventory.md`](14-client-logic-inventory.md). Extract to `@backsteros/contracts` — never share visual UI between mobile and desktop.
