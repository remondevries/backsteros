# Storage and search

## Target (ADR-035) — not implemented

**Private Cloudflare R2** is the shared file store: markdown, letter PDFs, task attachments, avatars, space covers, and other `.backsteros` blobs. Postgres keeps metadata + `storage_key` only. Do not use the public WordPress bucket `ld-wp-media`.

The desktop keeps the vault layout below as a **local working copy** and syncs changes. Opening an area must not re-download every file. PowerSync does not move file bytes. iOS fetches an object when it opens it, via cloud-core.

## Local vault (desktop working copy; source of truth today)

Until ADR-035 is built, document bodies and letter PDFs still live only in an **Obsidian-style local vault** on the Mac. Cloud-core twins `.md` files onto its own disk and returns `503 pdf_requires_local_core` for PDF and attachment bytes.

Configure via desktop **Settings → Storage** or `BACKSTEROS_VAULT_PATH`.

### Vault layout

```text
{vault}/
  Journal/
    {YYYY-MM-DD}.md
  Projects/
    {PROJECT_KEY}/              # always created (even with no documents)
      Codebase/                 # codebase projects only
      Documents/
        {path}.md
      Updates/
      .cursor/
        skills/
          backsteros-workflow-in_review-or-on_hold/
            SKILL.md            # seeded once; agent cwd for non-codebase chats
  Letters/
    {YYYY}/
      {MM}/
        {YYYY-MM-DD} - {Subject}.pdf
  Spaces/
    knowledge-base/
      second-brain/
    support/
    websites/
    {path}.md
  .backsteros/           # avatars and other non-browsable blobs
```

Clients never talk to the filesystem directly for sync — they use the API /
PowerSync metadata and lazy `GET …/content` or `…/pdf`.

Opening a project (desktop or mobile) calls `POST /api/v1/projects/:id/ensure-vault`
so the folder + `.cursor` skills are created on the fly if missing. Every project
vault includes `Codebase/`, `Documents/`, and `Updates/`. When
`localWorkingDirectory` is empty, codebase projects default to
`{vault}/Codebase` (and Development `{ kind: "local", path }` mirrors that path)
and other types to the vault project root. Prefer writing structured
`development` / `production` on the project API; compat string columns stay
mirrored for older clients and OS-106 path resolution.

## Object storage

**Target:** private R2, ADR-035. The notes below are the older “optional remote” plan. v2 code still uses the local vault.

### Primary remote option: Backblaze B2 or Cloudflare R2

| Provider | Best for |
| --- | --- |
| **Backblaze B2** | Lowest cost for 100+ GB mostly-at-rest (~$6/TB/mo) |
| **Cloudflare R2** | Frequent PDF downloads (zero egress) |

S3-compatible API — use AWS SDK `@aws-sdk/client-s3` with custom endpoint if/when
a remote blob backend is reintroduced. v2 default is the local vault above.

### Legacy cloud key layout (superseded)

```text
{bucket}/
  markdown/
    journal/{YYYY-MM-DD}.md
    knowledge/{path}.md
    projects/{project_key}/{path}.md
  letters/
    {YYYY-MM-DD} - {title}.pdf
  attachments/
    {entity_type}/{id}/{filename}
```

Postgres holds canonical `storage_key` per object.

### Access patterns

| Consumer | Access |
| --- | --- |
| Human app (open doc) | API streams or returns presigned URL (short TTL) |
| AI agent | `GET /api/v1/documents/{id}/content` |
| Portal | Same REST with scoped API key |
| Direct bucket | Never expose credentials to clients |

## PostgreSQL metadata

Stores for each document/letter:

- `id`, `path`, `title`, `project_id`
- `storage_key`, `byte_size`, `content_type`, `checksum`
- `snippet` (for list views + search seed)
- `content_version`, `updated_at`

## Search — Postgres FTS / ILIKE

Live search runs in PostgreSQL behind **`GET /api/v1/search`** (no Meilisearch or other search sidecar).

### Role

- Document body/title/path/snippet search via server-only `document_search_index` (GIN `search_tsv`)
- Task and other entity search via SQL / ILIKE as implemented on those routes
- Agents and apps call the REST API only — never a separate search host

### Index pipeline

On document save (human or agent):

1. Write body to local vault (or object storage)
2. Update Postgres metadata + snippet
3. Upsert `document_search_index` (`search_body` + `search_tsv`) for FTS

For PDFs: extract text when available → store binary in the vault (or B2/R2 when remote); searchable text follows the same Postgres index path when wired.

See **Postgres document search index (OS-80)** below for GIN details, etag retrieve rules, and the 80k-char FTS truncation.

## Search vs sync

| Mechanism | Purpose |
| --- | --- |
| **PowerSync** | User’s working set (tasks, indexes) offline |
| **Postgres FTS / ILIKE** (`GET /api/v1/search`) | Global search across the corpus on the server |
| **Lazy GET content** | Open single file from storage |

Do not sync entire corpus to device for search — server search + local index tier B is enough.

## Legacy Circle storage

Circle uses:

- SQLite `circle.db` on server VM (Docker volume)
- DO Spaces for markdown + PDFs + sync batches
- Local vault on desktop

BacksterOS: **Postgres replaces server SQLite**; **local Obsidian-style vault**
replaces Spaces for markdown + PDFs on the core computer (optional remote B2/R2 later).

## Cost estimate (100 GB PDFs + growth)

| Item | ~Monthly |
| --- | --- |
| Local vault / disk | $0 |
| Docker Postgres (metadata + FTS index) | $0 |
| Local computer | Already have |

## AI agent read workflow

```text
1. GET /api/v1/search?q=invoice&type=knowledge
2. GET /api/v1/search?q=FiboSearch&type=task   → open task hits (status=all for closed)
3. GET /api/v1/search?q=QM-38&type=task        → exact key still returns a closed task
4. GET /api/v1/documents/{id}/content          → markdown body when needed
5. GET /api/v1/letters/{id}/pdf                → binary when needed
6. PATCH /api/v1/documents/{id}/content        → write markdown
```

Agents never need filesystem paths or repo checkout.
`GET /search` `type` is `project` | `knowledge` | `journal` | `task` (alias `tasks`);
unknown values return **400**. Omit `type` for document search only.

## Postgres document search index (OS-80)

Server-only table `document_search_index` holds `search_body` plus a GIN `search_tsv` (`simple` config) on title, path, snippet, properties, and body. It is not in PowerSync. `GET /search` and `GET /documents/retrieve` match body text through this index.

Retrieve serves the indexed body only when `document_search_index.content_etag` equals `documents.content_etag` (sha256, first 32 hex chars). Otherwise it reads the vault as before.

Body text past **80,000 characters** is stored for retrieve but is not in `search_tsv`, so it is not full-text searchable.

Live backfill (opt-in, batched, resumable; do not run from an agent):

```bash
set -a && source ~/.config/backsteros/local-core.env && set +a
pnpm --filter @backsteros/server exec tsx src/scripts/backfill-document-search-index.ts \
  --allow-live --batch-size 50 --pause-ms 250
```

Resume with `--after-id <lastId>` from the last batch JSON.

