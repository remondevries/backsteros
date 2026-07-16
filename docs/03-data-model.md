# Data model

## Storage split

| Store | Holds | Does not hold |
| --- | --- | --- |
| **PostgreSQL** | Tasks, projects, contacts, letter/document **metadata**, users, API keys, sync events, search snippets | PDF bytes, full markdown bodies (at scale) |
| **Object storage (B2/R2)** | Markdown file bodies, PDF binaries, large attachments | Queryable relational data |
| **Meilisearch** | Search index (title, path, snippet, extracted PDF text) | Source of truth |
| **Client SQLite (PowerSync)** | Cached metadata per sync rules + outbox queue | Full vault, all PDFs |

## Sync tiers

Every entity type has a tier. **Enforce in PowerSync sync rules and API design.**

| Tier | Description | Sync to client? | Example |
| --- | --- | --- | --- |
| **A** | Small structured records | Yes, full record | tasks, projects, contacts |
| **B** | Content **index** only | Yes, summary fields | doc title, path, snippet, letter metadata |
| **C** | Large / server-primary | **No** bulk sync; paginated API | transaction history, workout sets |
| **D** | Blobs | **Never** sync; fetch on demand | PDF bytes, full markdown body |

### Critical rule

> **No client may sync Tier C or Tier D by default.**

This protects iPhone 16 / M1 memory and disk. See [07-performance.md](07-performance.md).

## Core entities (from Circle scope)

| Entity | Tier (metadata) | Tier (content) | Notes |
| --- | --- | --- | --- |
| Task | A | — | Bulk update target |
| Project | A | — | |
| Contact / Organization | A | — | |
| Document (project/knowledge) | B | D (body in object storage) | |
| Journal entry | B | D | One file per day |
| Letter | B | D (PDF) | |
| User / settings | A | — | |
| API key | — (server only) | — | |

## Future entities

| Entity | Tier | Notes |
| --- | --- | --- |
| Financial transaction | C | Append-only ledger in Postgres; paginated API |
| Workout session | B header, C sets | Sync session list; sets via API pages |
| Attachment | B metadata, D blob | Same as letters |

## Document version fields (required)

Every document-like row in Postgres:

```text
id, path, title, project_id, storage_key,
content_version, content_etag,
snippet (first ~500 chars for search),
updated_at, deleted_at
```

`content_version` increments on every body write (human or agent). Clients use it to detect stale editor state.

## Sync events table (conceptual)

```text
sync_events (
  cursor BIGSERIAL PRIMARY KEY,
  mutation_id UUID,
  device_id TEXT,
  entity TEXT,
  entity_id TEXT,
  operation TEXT,  -- upsert | delete
  payload JSONB,
  created_at TIMESTAMPTZ
)
```

PowerSync may mirror Postgres via replication; sync events remain the audit trail for agent/live channels.

## Conflict resolution (default)

- **Metadata fields:** last-write-wins per field with `updated_at`
- **Document body:** version bump; if editor is dirty, prompt or merge (see live documents)
- **Money / transactions:** server-only append; no client delete

## Circle schema reference

Legacy SQLite schema: `~/code/circle.remondevries.com/lib/db/schema.ts`  
Migrate entity names and relationships; do not copy platform-branching patterns.
