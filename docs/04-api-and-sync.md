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
GET  /api/v1/search?q=architecture&type=knowledge
GET  /api/v1/search?q=architecture&include=task
GET  /api/v1/search?q=FiboSearch&type=task&status=all
GET  /api/v1/search?q=QM-38&type=task
POST /api/v1/search/batch
GET  /api/v1/projects
GET  /api/v1/projects/OS
GET  /api/v1/tasks?paginated=true&projectId=OS&status=in_progress
GET  /api/v1/tasks/OS-51
GET  /api/v1/meetings?projectId=OS&paginated=true&limit=20
GET  /api/v1/contacts?paginated=true&limit=50
GET  /api/v1/organizations?paginated=true&limit=50
GET  /api/v1/letters?status=triage&paginated=true
GET  /api/v1/documents?limit=100
GET  /api/v1/tasks/due?paginated=true&limit=50
GET  /api/v1/global-search?q=backster&mode=tasks
GET  /api/v1/organizations/IN
GET  /api/v1/documents/{id}
GET  /api/v1/documents/{id}/content
GET  /api/v1/letters/{id}
GET  /api/v1/letters/{id}/pdf          → redirect or presigned URL
```

Path params and filter ids accept the **internal id or the human key**
(`OS-51` for a task, `OS` for a project, org/contact keys likewise).
Unknown filter ids return **400** (not an empty 200). Bad enum values
(`status=bogus`, `mode=bogus`, `type=bogus` on search/documents) likewise return **400**
with a `field` in the body.

#### `GET /search` (agents)

| Param | Behaviour |
| --- | --- |
| `q` | Required. Documents: ILIKE on title/path/snippet. Tasks: ILIKE on title/description; display key (`QM-38`) or exact task id is preferred on the first page |
| `type` | `project` \| `knowledge` \| `journal` \| `task` (alias `tasks`). Omit for documents only. Unknown → **400** `field: type` |
| `include` | `task` \| `tasks` — when searching documents, also run task search for the same `q` and merge hits ranked by `updatedAt` (capped at `limit`). Document hits appear **only on the first page**; a `cursor` paginates tasks only (OS-76). Invalid with `type=task` |
| `projectId` | Optional filter (id or project key) |
| `status` | Tasks only: comma-separated statuses (OR), or `all`. Omit to hide `completed` / `canceled` / `duplicated` (same default as paginated `GET /tasks`) |
| `limit` | Default 20, max 50 |
| `cursor` | Tasks only: opaque keyset on `(updatedAt desc, id)`. With `include=task`, cursor continues the task side after page 1 |

#### `GET /search?type=task` defaults (OS-81)

Task **text** search without `status` excludes `completed`, `canceled`, and `duplicated`:

- Header `X-BacksterOS-Hint: completed, canceled, duplicated excluded by default; pass status=... to include them`
- Body `appliedDefaults: { excludedStatuses: ["completed","canceled","duplicated"] }`

Pass `status=all` for every known status, or an explicit list (`status=completed`). Exact display-key or task-id lookup on the first page still returns that row even when it is closed (same as `GET /tasks/:id`). `include=task` uses the same default on the task side.

`GET /global-search?mode=tasks` (command palette) does **not** apply this default; it still searches all statuses.

Task results: `{ id, type: "task", key, projectId, status, title, snippet, updatedAt }` plus response `nextCursor` (and `appliedDefaults` when the default exclusion applied).
Document results keep `{ id, type, projectId, path, title, snippet, updatedAt }`.
Prefer **`type=task`** for task text search; `GET /global-search?mode=tasks` remains for mixed command-palette hits.

Identical agent search / document-retrieve lookups within ~15s share an in-memory
result (OS-76). The cache is invalidated on every task or document write in that
workspace (API and replication apply). For several different lookups in one turn prefer:

```http
POST /api/v1/search/batch
{ "queries": [
  { "id": "r1", "kind": "retrieve", "q": "architecture", "budget": 4000, "limit": 5 },
  { "id": "s1", "kind": "search", "q": "OS-76", "type": "task", "limit": 5 },
  { "id": "s2", "kind": "search", "q": "vault", "include": "task", "limit": 5 }
]}
```

Queries run with concurrency 4 (max 10 items). `kind=retrieve` needs `documents:read` as well as
`search:query`. Per-item failures return `{ id, kind, error, field? }` without failing
the whole batch. Malformed JSON → **400**.

### List pagination (agents)

Most collection GETs keep a legacy array shape (`{ projects }`, `{ meetings }`, …)
for existing clients. Opt in to `{ items, nextCursor }` with **`paginated=true`**
(or a `cursor`):

| Param | Behaviour |
| --- | --- |
| `paginated=true` | Response `{ items, nextCursor }`; default `limit=50`, max 200 |
| `limit` | Page size (ignored in legacy mode — see `X-BacksterOS-Hint`) |
| `cursor` | Opaque keyset on `(updatedAt desc, id)`; TTL 10 minutes |
| `updatedSince` | Incremental change feed (ISO instant) |

`GET /documents` always applies **`limit=100`** when omitted (hint header).
`GET /global-search` rejects unknown `mode` and sets a hint when `limit` is clamped to 100.

Meetings accept `projectId`, `organizationId`, `contactId` (attendee), `status`,
`from`/`to` (on `startAt`), and `q`. List rows omit `transcription` (fetch via
`GET /meetings/:id`).

Unknown filter ids on paginated `GET /tasks` return **400** (not an empty 200).

#### Paginated `GET /tasks` defaults (OS-57)

`GET /api/v1/tasks?paginated=true` (or with a `cursor`) without `status` and
without `updatedSince` **excludes** `completed`, `canceled`, and `duplicated`.
That is intentional for agents listing open work, but the response must not
look complete:

- Header `X-BacksterOS-Hint: completed, canceled, duplicated excluded by default; pass status=... to include them`
- Body `appliedDefaults: { excludedStatuses: ["completed","canceled","duplicated"] }`
- With `includeTotalCount=true`, also `excludedCount` (how many matching rows
  were hidden by that default)

Pass `status=all` for every known status, or an explicit comma list
(e.g. `status=completed,canceled`). Giving `status` or `updatedSince`
suppresses the default, the hint, and `appliedDefaults`.

```http
GET  /api/v1/tasks?paginated=true&projectId=OS&includeTotalCount=true
GET  /api/v1/tasks?paginated=true&projectId=OS&status=all
GET  /api/v1/tasks?paginated=true&projectId=OS&status=in_progress
```

### Write (agents)

```http
PATCH /api/v1/documents/{id}/content
POST  /api/v1/tasks
      Idempotency-Key: <optional unique key>   # 24h cache; retries return same task
POST  /api/v1/tasks/batch
      { "ids": ["OS-51", "OS-52"], "patch": { "status": "in_review" } }
      → { tasks, results[] }  # unknown refs → results[].ok=false (no upsert)
PATCH /api/v1/tasks/OS-51
POST  /api/v1/tasks/OS-51/comments
      Idempotency-Key: <optional>
      # optional images: [{ data: "<base64>", contentType?, filename?, alt? }] (max 5)
POST  /api/v1/tasks/{id}/images
      Content-Type: image/png   # or image/jpeg|webp|gif — raw bytes, max 10 MB
      X-Filename: screenshot.png
      <raw image bytes>
POST  /api/v1/tasks/{id}/images
      Content-Type: application/json
      { "data": "<base64 or data-URL>", "contentType": "image/png", "filename": "shot.png", "alt": "bug", "commentId": null }
GET   /api/v1/tasks/{id}/images
GET   /api/v1/tasks/{id}/images/{imageId}
POST  /api/v1/tasks/{id}/attachments
      Content-Type: application/pdf   # or image/*, message/rfc822, etc.
      X-Filename: brief.pdf
      <raw file bytes, max 25 MB>
GET   /api/v1/tasks/{id}/attachments
GET   /api/v1/tasks/{id}/attachments/{attachmentId}
GET   /api/v1/tasks/OS-51?include=comments   # last 20 comments + images[] inline
```

**Task description/comment images (OS-90):** JPEG/PNG/WebP/GIF only (byte sniff; SVG rejected). Same `task_images` row + vault/R2 key as desktop paste. Markdown embed: `![alt](/api/v1/tasks/{taskId}/images/{imageId})` — Bearer-auth download, no public URL. `POST`/`PATCH` `/tasks` and `POST`/`PATCH` comments accept `images: [{ data, contentType?, filename?, alt? }]` (max 5) and append markdown. `GET` task returns description-scoped `images[]`; comments include their `images[]`. Metadata twins via core-replication (`task_images`); bytes via shared R2 or peer pull-on-miss.

Task file attachments (any common type: PDF, image, email `.eml`, office docs, …) require `tasks:write` / `tasks:read` and **local-core** for blob put/get (cloud-core returns `503 pdf_requires_local_core`). Metadata lists work from either role.

Every write runs the **unified write pipeline** (storage → Postgres → sync event → Meilisearch → realtime).

#### One-call task recipes (OS-64)

Agents should prefer these over separate status + comment / commit-link round trips:

```http
# Status + comment in one call (required for on_hold / canceled / duplicated)
PATCH /api/v1/tasks/OS-51
{ "status": "canceled", "comment": { "body": "Duplicate of OS-40" }, "activityActor": "agent" }
→ task row includes `comment`

# Append commit SHAs without racing replace
PATCH /api/v1/tasks/OS-51
{ "addLinkedCommitShas": ["abc1234"] }
# still supported: linkedCommitShas replaces the full list

# Create on a project by key (+ optional assignee/related contact keys + comment)
POST /api/v1/tasks
Idempotency-Key: create-os-brief-1
{ "title": "…", "projectKey": "OS", "assigneeId": "NC4", "comment": { "body": "…" }, "activityActor": "agent" }

# List / get without a follow-up /projects or /contacts fetch
GET /api/v1/tasks?paginated=true&projectId=OS
→ items include projectKey + assigneeName
GET /api/v1/tasks/OS-51?include=comments
→ task includes projectKey, assigneeName, comments[], images[]

# Attach a screenshot when creating / commenting (agents)
POST /api/v1/tasks
{ "title": "Layout break", "projectKey": "OS", "images": [{ "data": "<base64 png>", "alt": "screenshot" }], "activityActor": "agent" }
POST /api/v1/tasks/OS-51/comments
{ "body": "See screenshot", "images": [{ "data": "<base64 png>" }], "activityActor": "agent" }
```

`linkedCommitShas` on create/update still **replaces** the full list when set. Prefer
`addLinkedCommitShas` / `removeLinkedCommitShas` for agent linking so concurrent
adds both persist (server-side dedupe).

Remon: update the shared agent skill / CLI finish flow to use status+comment and
`addLinkedCommitShas` instead of GET-then-replace.

### Agent-working marker (OS-96)

Business agents (finance, comms, admin) that work tasks through the agents API —
not Development-app coding sessions — can mark themselves as working or
reviewing so desktop and BacksterDEV show the same badge as coding runs, plus
the agent’s name (e.g. “Ralph is working”, “Sander is reviewing”).

This is **orthogonal** to `agentChatId` (Cursor / Development session binding)
and to ephemeral `PUT/DELETE /tasks/:id/agent-presence` heartbeats (TTL-based
coding-run presence). Development coding sessions (control API / Start working)
also set this durable marker with label `Coding agent running` so desktop shows
the same badge when the UI is closed (BDV-53); core still auto-clears it on
`in_review`.

**Fields** (on the task row; also on paginated list items):

| Field | Meaning |
| --- | --- |
| `agentWorkingContactId` | Contact id of the agent persona (e.g. Ralph) |
| `agentWorkingStartedAt` | When the marker was set (server-stamped) |
| `agentWorkingLabel` | Optional chat link / label |
| `agentWorkingKind` | `working` (default) or `reviewing` |
| `agentWorkingContactName` | Display name (response enrichment) |

```http
# Claim as working (agents may only set their own contact unless owner)
PATCH /api/v1/tasks/BF-37
{
  "agentWorkingContactId": "CotMY5Bd6gv7mWOzioLbe",
  "agentWorkingKind": "working",
  "agentWorkingLabel": "Ralph · BF-37"
}

# Reviewer claims while the task is in_review
PATCH /api/v1/tasks/OS-96
{
  "agentWorkingContactId": "<Sander contact id>",
  "agentWorkingKind": "reviewing"
}

# Clear
PATCH /api/v1/tasks/BF-37
{ "agentWorkingContactId": null }
```

When claiming without `agentWorkingKind`, the server defaults to `reviewing` if
status is `in_review`, otherwise `working`.

**Auto-claim:** an agent persona API key (contact-bound, not the workspace
owner) that moves a task to `in_progress` without an explicit marker sets
`agentWorkingContactId` to that key’s contact with kind `working`.

**Auto-clear**

| Transition / event | Effect |
| --- | --- |
| Status → `completed`, `canceled`, `duplicated`, `on_hold` | Clear any marker |
| Status → `in_review` | Clear a `working` marker (hand-off). A `reviewing` marker is kept |
| Status leaves `in_review` (e.g. back to `in_progress`, or complete) | Clear a `reviewing` marker |
| Explicit `agentWorkingContactId: null` | Clear |

**Permission:** agent API keys may only set/clear their own contact. Local shell
and owner-bound API keys may set any contact.

### Auto-review webhook (OS-92)

When a task has `automateCompletion: true` and its status **transitions** to
`in_review` (the agent-done moment), cloud-core POSTs JSON to Sander’s webhook.
No new BacksterOS task is created. Completing the task (`completed`) does **not**
fire the webhook (no loops). Failed agent sessions never reach `in_review`, so
they never fire.

**Per-task field** (default `false`; PATCH `/api/v1/tasks/:id`):

```http
PATCH /api/v1/tasks/OS-92
{ "automateCompletion": true }
```

Tasks also expose `autoReviewDeliveryStatus`: `pending` | `delivered` | `failed`
(outbox may briefly be `sending` while a lease is held; that maps to `pending`
in the API).

**Settings** (secrets encrypted at rest; never logged or returned raw). PATCH and
Send test are owner-only (`local_shell` or a non–contact-bound API key with
`settings:write` — same gate as API key admin). URL must be absolute `https://`
(empty string clears; `http://` only for localhost in development).

```http
GET   /api/v1/settings/auto-review-webhook
PATCH /api/v1/settings/auto-review-webhook
      {
        "url": "https://…",
        "secret": "…",
        "authorizationHeader": "Bearer …",
        "enabled": true
      }
POST  /api/v1/settings/auto-review-webhook/test
```

GET returns masked `secretPreview` / `authorizationHeaderPreview` (last four)
plus `secretConfigured` / `authorizationHeaderConfigured` booleans and recent
failures. Empty string clears a secret field; omit leaves it unchanged. Never
return the full HMAC secret or Authorization header value.

`enabled` must be on and both URL and HMAC secret set, or nothing is enqueued.
The optional Authorization header is the **receiver’s own sender key** (Grok Bot
routine). It is distinct from the HMAC signing secret — never derive one from
the other, and never send the HMAC secret as Authorization.

**Encryption key.** Both cores that store or read secrets must share the same
key material: prefer `BACKSTEROS_SECRET_ENCRYPTION_KEY`, else
`CORE_REPLICATION_SECRET`. In production / cloud role, PATCH refuses to save a
secret or Authorization header if neither is set (no public fallback). Local/dev
may use a built-in fallback only when neither env var is set. HMAC + Authorization
are packed into the existing encrypted ciphertext column (no extra migration).

**Send test.** Allowed on local-role cores (desktop Settings) as a one-shot POST:
the core POSTs first, then inserts a single terminal outbox row (`delivered` or
`failed`). No `pending`/`sending` row is written, so cloud never claims or
re-sends the test. Background delivery workers remain cloud/standalone only.

**Request the receiver should verify**

```http
POST <configured URL>
Content-Type: application/json
Authorization: <optional configured sender key, e.g. Bearer …>
X-BacksterOS-Timestamp: <unix-ms>
X-BacksterOS-Signature: sha256=<hex>
X-BacksterOS-Delivery-Id: <deliveryId>
```

The Grok Bot webhook routine authenticates the sender with its own key via
`Authorization`. HMAC over `` `${timestamp}.${rawBody}` `` (using the separate
signing secret) is the additional integrity and replay check. When the
Authorization header setting is empty, BacksterOS omits the header entirely.
The HMAC signing secret is **never** placed in Authorization.

Receiver checklist:

1. Require the expected Authorization sender key (Grok Bot).
2. Reject if `|nowMs - Number(X-BacksterOS-Timestamp)| > 5 * 60_000` (replay window).
3. Verify HMAC-SHA256 over the UTF-8 string `` `${timestamp}.${rawBody}` `` using
   the **raw request body bytes** (not a re-serialized JSON object).
4. Compare the hex digest to the value after `sha256=` with a timing-safe equals.
5. Dedupe on `deliveryId` (stable across retry attempts of the same outbox row).

Node verification sketch (HMAC only; check Authorization separately):

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(req, rawBody, hmacSecret) {
  const ts = req.headers["x-backsteros-timestamp"];
  const sig = String(req.headers["x-backsteros-signature"] ?? "")
    .replace(/^sha256=/i, "")
    .trim();
  if (!ts || Math.abs(Date.now() - Number(ts)) > 5 * 60_000) return false;
  const expected = createHmac("sha256", hmacSecret)
    .update(`${ts}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

**JSON body** (`event` is always `task.ready_for_review`):

```json
{
  "event": "task.ready_for_review",
  "taskId": "…",
  "taskKey": "OS-92",
  "title": "…",
  "projectId": "…",
  "projectKey": "OS",
  "projectName": "BacksterOS",
  "assigneeId": "…",
  "assigneeName": "Sander",
  "timestamp": "2026-10-06T12:00:00.000Z",
  "threadId": "<bound agentChatId / Development session>",
  "sessionId": "<live presence session id when known>",
  "commitHashes": ["abc1234"],
  "deliveryId": "…",
  "attempt": 1
}
```

Send-test adds `"test": true` and uses `taskId: "test"`. Ignore those for review.

**Delivery:** written to `auto_review_webhook_deliveries` in the same transaction
as the status change. Only cloud-core (`CORE_REPLICATION_ROLE=cloud`) or a
standalone core (no peer URL/secret) runs the background worker. A local core
with peer configured but an unset role does **not** run the worker (matches
`getCoreReplicationConfig`). Timeout 10 s. 2xx = success. Retry 5xx, timeouts,
and network errors with backoff 1m, 5m, 15m, 1h, 6h (max 6 attempts). Do not
retry other 4xx; 408/429 retry and honour `Retry-After`. Workers claim at most
5 rows with a lease of `limit × 10s + 60s`; finalize/fail only when
`status='sending' AND next_attempt_at` still equals that claim’s lease (stale
finalizers after a re-claim are no-ops). Success activity and the failure
comment are written only by the path that wins the lease. If the webhook is
disabled or the secret cannot be decrypted, the row is marked `failed`. After
the last attempt the delivery is dead: the task shows
`autoReviewDeliveryStatus: failed` and a comment `Auto-review trigger failed`.
A successful delivery records activity `auto_review_requested`
(“Auto-review requested from Sander”).

### OpenAPI

- Generated from ts-rest / Zod contracts in `packages/contracts`
- Published at `/api/v1/openapi.json`
- `packages/api-client` generated for all UI repos

## API key scopes (planned)

| Scope | Allows |
| --- | --- |
| `projects:read` | List/read projects |
| `tasks:read` / `tasks:write` | Task CRUD + batch + file attachments |
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

Open desktop shells subscribe to **local-core** workspace SSE. API agents write to
**cloud-core** (`https://agent.backsteros.com`); cloud nudges the local replica so
open editors refresh without waiting for the periodic tick.

```http
GET /api/v1/workspace/events
```

Authenticated SSE (local-shell or API key) on local-core. Events:

```text
event: workspace.updated
data: { "kind":"document", "entityId":"…", "projectId":null, "reason":"patch", "contentVersion":3, "operation":"upsert" }
```

Flow:

1. Desktop starts `GET /api/v1/workspace/events` on **local-core**
2. Agent writes via API key on **cloud-core** (`https://agent.backsteros.com`):
   - `PATCH /api/v1/documents/{id}/content` (body), or
   - create / update / move / reorder / delete (metadata)
3. Writing core appends `sync_events` + vault twin, then `POST` peer
   `/internal/core-replication/nudge` (Tailscale; ignored if peer offline)
4. Peer pulls vault `.md` when `storage_key` is set (local also pulls
   `sync_events`), heals metadata, and publishes `workspace.updated`
5. Open editor force-GETs `/api/v1/documents/{id}/content` when `contentVersion`
   advances (dirty edit drafts are preserved)
6. Document lists overlay the SSE-fetched metadata row until PowerSync catches up
7. Periodic replication tick (`CORE_REPLICATION_INTERVAL_MS`, default 15s) remains
   the backup if a nudge was missed; post-apply publish covers tick catch-up

Direction: **cloud ↔ local** (agent on cloud wakes desktop; desktop/vault edit on
local wakes cloud). Local vault `.md` edits (`fs.watch` → metadata heal) also
nudge the peer.

## File-task callback mailbox (Cloud Core)

Development’s **File as BacksterOS task** flow cannot receive Grok Bot POSTs on
localhost. Cloud-core holds a TTL mailbox (30 minutes, not replicated):

```http
POST /api/v1/file-task-callbacks
GET  /api/v1/file-task-callbacks/{requestId}
POST /api/v1/public/file-task-callbacks/{requestId}?token=…
```

BDV (API key, `tasks:write` / `tasks:read`) mints a tokenized `callbackUrl` on
`https://agent.backsteros.com`. The agent POSTs the fixed result JSON to that
URL. Unknown tokens 401; expired rows are pruned.

## Email agent command (Grok Bot / Judith)

Desktop email-thread bottom box wakes one webhook (`email_grok_webhook_*`) with
`kind: "email.agent_command"`. The open email is **context**; the agent classifies
intent from `userPrompt`.

`email_agent_callbacks` is **cloud-only** (not replicated). Callback URLs always
use `https://agent.backsteros.com`. On hybrid local-core, wake + poll forward to
cloud-core over `/internal/core-replication/email-agent-draft*` so Judith can POST
back through the agents door. Simple core-executed intents (OS-94) stay local.

```http
POST /api/v1/email/inboxes/:inboxId/messages/:messageId/agent-draft
GET  /api/v1/email/agent-draft-callbacks/:requestId
POST /api/v1/public/email-agent-callbacks/:requestId?token=…
```

**Wake (core → Judith):** `requestId`, `callbackUrl`, `userPrompt`, inbox/message/thread
ids, `email { from, to, subject, text }`, `language`, optional `currentDraftBody`,
`contactId` (thread contact id or `null`), `linkedTaskKeys` (display keys of tasks
that link to this email thread, e.g. `["OS-45"]` — always an array, empty when none),
`allowedIntents: ["reply_draft","task","calendar","note"]`.

Agents can use `contactId` with
`GET /api/v1/tasks?paginated=true&relatedContactId=<id>`, or open a key from
`linkedTaskKeys` directly.

**Callback (Judith → core)** — echo `requestId` exactly:

| Intent | Body shape | Core side effect |
| --- | --- | --- |
| `reply_draft` | `{ ok, requestId, intent, body }` | Concept reply draft (composer opens) |
| `task` | `{ ok, requestId, intent, task: { title, description?, projectKey?, dueDate? } }` | Creates BacksterOS task |
| `calendar` | `{ ok, requestId, intent, event: { title, start, end, notes? } }` | Creates meeting/agenda event |
| `note` | `{ ok, requestId, intent, message }` | Agent thread comment only |
| failure | `{ ok:false, requestId, error }` | Stored for poll; no side effects |

Legacy `{ ok, requestId, body }` (no `intent`) is treated as `reply_draft`.
External send is never done on this path — human review before send remains.

Repo files outside the vault (e.g. git `docs/*.md`) are not BacksterOS documents and will not appear in the desktop app.

### Conflict policy (v1)

| Situation | Behavior |
| --- | --- |
| User idle / preview, agent writes | Auto-refresh editor content via SSE |
| User typing (dirty draft), agent writes | Keep local draft; do not clobber |
| Both offline | Sync pull / PowerSync catch-up on reconnect |

### Levels of collaboration

| Level | Description | Target |
| --- | --- | --- |
| 1 | Whole-file replace on save | Phase 1 |
| 2 | Live session + version + workspace SSE | Phase 2 (agent + human goal) |
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

### Merge rules (retiring)

- Once SQLite has rows, **local membership and fields win** — no newer-API overlay on Tier A/B lists (`resolveLocalOrApiRows`).
- `preservePendingApiRows` / `mergeLocalWithPendingApiCreates` keep optimistic creates until SQLite-first creates land.
- Column fillers (`fillMissingLinksFromApi`, long text, due dates, …) run on **cold-start rescue only** (`apiFillSourceForColdStart`). Do not add live REST field merges.
- Documents still use a temporary live merge (`mergeLocalDocumentsWithLiveApi` + soft-revalidate) until SSE→local (see [`16-linear-shaped-sync.md`](16-linear-shaped-sync.md)).

### Failure modes

| Local SQLite | REST | UX |
| --- | --- | --- |
| Empty | OK | Lists fill from REST cold-start rescue; `source` may still flip to `powersync` once any watch returns |
| OK | Fail | PowerSync-only |
| Both stale | — | User sees SQLite snapshot; next PowerSync download refreshes |

### Debugging

- `workspace.source` — `"powersync"` once a local tasks watch has rows, else `"empty"`
- `workspace.ready` — PowerSync readiness + local/api entity load + a **5s** `queriesGracePeriodExpired`. `restHydrateSettled` no longer unblocks UI by itself (avoids REST-first flashes).
- Prefer React Profiler on a single task status patch when changing merge or watch code

### Client logic sharing

Mirrored pure helpers (due filters, inbox attention, …) are inventoried in [`docs/14-client-logic-inventory.md`](14-client-logic-inventory.md). Extract to `@backsteros/contracts` — never share visual UI between mobile and desktop.
