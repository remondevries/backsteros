# API and sync

## Overview

Three surfaces on one backend:

1. **PowerSync** — apps (offline, local SQLite, partial sync)
2. **REST / OpenAPI** — agents, portals, automation
3. **Live documents** — SSE/WebSocket for open-file collaboration

## Sync API (apps)

Aligned with Linear-style cursor sync. PowerSync handles transport; these are the logical operations the API validates on upload.

### Bootstrap (scoped)

```http
POST /sync/bootstrap
```

Returns: `schema_version`, `cursor`, snapshot of Tier A + B entities per sync rules, `spaces_configured` flag.

Does **not** include Tier D bodies.

### Pull deltas

```http
GET /sync/pull?cursor={n}
```

Returns: `events[]`, `has_more`, new `cursor`.

### Push mutations (batch)

```http
POST /sync/push
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

### Realtime hint (optional)

```http
GET /sync/stream
```

SSE: `{ "cursor": 4821 }` — client calls `pull` when cursor advances.

## REST API v1 (agents + portals)

Base: `https://service.backsteros.com/api/v1`

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
| `search:query` | Meilisearch proxy |

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

Client writes locally → PowerSync queue → `uploadData` callback on API → same domain functions as REST → Postgres → replication back to clients.

**One implementation** of business logic; REST is a thin wrapper for external callers.

## Circle API reference

Legacy endpoints documented in `~/code/circle.remondevries.com/AGENTS.md` (`/api/v1`, `/api/mobile/v1/sync/*`). BacksterOS unifies mobile and web sync into one protocol.
