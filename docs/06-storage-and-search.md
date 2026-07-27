# Storage and search

## Local vault (v2 primary)

BacksterOS stores document bodies and letter PDFs in an **Obsidian-style local
vault** on the core computer. Postgres keeps metadata + `storage_key` only.

Configure via desktop **Settings → Storage** or `BACKSTEROS_VAULT_PATH`.

### Vault layout

```text
{vault}/
  Journal/
    {YYYY-MM-DD}.md
  Projects/
    {PROJECT_KEY}/
      Codebase/          # optional / empty OK
      Documents/
        {path}.md
      Updates/
  Letters/
    {YYYY}/
      {MM}/
        {YYYY-MM-DD} - {Subject}.pdf
  Knowledge Base/
    {path}.md
  .backsteros/           # avatars and other non-browsable blobs
```

Clients never talk to the filesystem directly for sync — they use the API /
PowerSync metadata and lazy `GET …/content` or `…/pdf`.

## Object storage (optional / future remote)

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
- `snippet` (for list views + Meilisearch seed)
- `content_version`, `updated_at`

## Meilisearch

### Role

- Fast typo-tolerant search across 1500+ markdown files and PDF extracted text
- Agents call **`GET /api/v1/search`** — API proxies Meilisearch (do not expose Meilisearch publicly)

### Index pipeline

On document save (human or agent):

1. Write body to local vault (or object storage)
2. Update Postgres metadata + snippet
3. Async job: index `{ id, title, path, snippet, body_excerpt, project_id, type }`

For PDFs: extract text (pdf-parse, Apache Tika, or cloud parser) → index text; store binary in the vault (or B2/R2 when remote).

### Index fields (proposed)

```text
id, type (document|letter|journal|knowledge),
title, path, project_id,
content_snippet, updated_at
```

Hybrid semantic search optional in Meilisearch v1.12+.

### Runner-up: Typesense

Use if index fits entirely in RAM and sub-5ms queries are critical. Meilisearch preferred for larger corpora on modest hardware.

## Search vs sync

| Mechanism | Purpose |
| --- | --- |
| **PowerSync** | User’s working set (tasks, indexes) offline |
| **Meilisearch** | Global search across full corpus |
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
| B2 100 GB | &lt; $1 |
| Neon Postgres (metadata) | $0 (free tier) → ~$5–15/mo if needed |
| Meilisearch on VM | $0 (sidecar) |
| VM (existing) | Already have |

## AI agent read workflow

```text
1. GET /api/v1/search?q=invoice&type=letter
2. GET /api/v1/letters/{id}           → metadata
3. GET /api/v1/letters/{id}/pdf       → binary when needed
4. PATCH /api/v1/documents/{id}/content → write markdown
```

Agents never need filesystem paths or repo checkout.
