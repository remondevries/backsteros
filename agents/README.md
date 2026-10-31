# BacksterOS Agents (VPS door)

Small HTTPS-facing proxy on the VPS so **always-on agents** (Grok Bot, etc.) can
reach BacksterOS **cloud-core** over the public internet — even when the laptop
is asleep.

```text
Always-on agents  --HTTPS + scoped API key-->  VPS agents door
                                              --> cloud-core (:8788 on VPS)

You / desktop / PTY  --localhost------------>  local-core (:8788 on Mac)
```

This service is a **door**, not a second BacksterOS. Requests are forwarded;
auth stays `Authorization: Bearer sk_live_…` (keys are replicated to cloud).

iOS and desktop **do not** use this door for day-to-day API calls.

## Why cloud-core (not Mac Tailscale)

Pointing `CORE_UPSTREAM_URL` at the Mac (MagicDNS / `100.x`) breaks agents when
the laptop sleeps. Production on the VPS must use **local cloud-core**:

```bash
CORE_UPSTREAM_URL=http://127.0.0.1:8788
```

Public base URL for agents: `https://agent.backsteros.com/api/v1`.

## List endpoints (agents)

Prefer **`paginated=true`** on collection GETs so responses are
`{ items, nextCursor }` with `limit` (default 50, max 200). Legacy
`{ projects }` / `{ meetings }` / … shapes remain without that flag;
`limit`/`cursor`/`updatedSince` are ignored there and reported via
`X-BacksterOS-Hint`.

```http
GET /api/v1/meetings?projectId=OS&paginated=true&limit=20
GET /api/v1/contacts?paginated=true&limit=50
GET /api/v1/documents            # default limit=100 + hint
GET /api/v1/search?q=…&type=task # task text / key / id search
GET /api/v1/search?q=…&include=task # documents + tasks for one q
POST /api/v1/search/batch        # parallel search + document retrieve
GET /api/v1/global-search?q=…&mode=tasks
```

Unknown filter ids and bad enums (`status=bogus`, `mode=bogus`, `type=bogus`) return **400**
with `field`. Keys work wherever ids are accepted (`projectId=OS`, `q=QM-38&type=task`).

For task text search prefer **`GET /api/v1/search?q=…&type=task`** (returns
`{ results: [{ id, type: "task", key, projectId, status, title, snippet, updatedAt }], nextCursor, appliedDefaults? }`).
Without `status`, text hits hide completed/canceled/duplicated (pass `status=all` or
`status=completed`). Exact key/id lookup still returns a closed task. `type=tasks`
is accepted as an alias. Omit `type` for document search only
(`project` / `knowledge` / `journal`). Use `include=task` to merge task hits into a
document search (docs only on page 1; `cursor` continues tasks; same status default).
Palette **`GET /global-search?mode=tasks`** does not apply that default. For several
lookups in one turn, prefer **`POST /api/v1/search/batch`**
(search + `documents/retrieve` queries with concurrency 4; short-TTL response cache
invalidated on task/document writes).

## Allowed traffic

All `/api/v1/*` routes are forwarded. Core enforces API key scopes (except the
AgentMail webhook route, which is Svix-authenticated).

Blocked at the door (never forwarded):

- PowerSync / sync / ops
- PTY sidecar (`/agent-pty`) — PTY stays local-only
- API key admin (`/api-keys`)
- Settings (`/settings/*`) — door allowlist block (defence in depth)

**Settings lockdown (OS-146):** agent persona keys are rejected on
`/api/v1/settings/*` in **core** (contact-bound API key → 403, even if a legacy
key still lists `settings:read`). The agents door **also** blocks `/settings/*`
so those requests never reach core. Older skill/docs text that only said
“agents proxy 403s settings” (implying the door alone) was incomplete — update
any shared `backsteros-tasks` / agent skill copy to match this dual block.

Attach a **contact** to each agent’s API key in Settings so comments and
activity show that person. Agent keys never hold `settings:read` /
`settings:write`; use `chat:*` and `email:*` for messaging.

## Shell chat webhooks (desktop chat column)

Settings → API → Agent configures an outbound HTTPS webhook. Core POSTs JSON;
reply with the agent’s API key to `replyUrl` (same as
`POST /api/v1/chat/threads/{threadId}/messages`).

| `event` | When | Handler rule |
| --- | --- | --- |
| `agent.chat.message` | Remon sent a chat message | Normal chat turn |
| `agent.webhook.test` | Settings → Test connection | Match **only** on `event`; never on message text. Optional short welcome via `replyUrl` |

**Live progress cards:** attach optional `progress` on the reply POST (`title`, `state`, optional `steps` ≤20 / labels ≤80, `current`/`total`, `detail`). Update the same message with:

```http
PATCH /api/v1/chat/threads/{threadId}/messages/{messageId}
{ "progress": { "title": "…", "state": "succeeded", "current": 3, "total": 3 } }
```

Desktop replaces the card via SSE. Progress PATCHes do **not** fire `agent.chat.message` (no loops). Terminal states lock further progress updates (HTTP 409).

Full shapes: `docs/04-api-and-sync.md` (Shell agent chat webhooks).

## Agents: start a conversation (OS-146)

Required scopes on the agent persona key: `chat:read` / `chat:write` and/or
`email:read` / `email:send`, plus `contacts:read` for lookup.

Always dry-run first (`dryRun: true` or `?validate=1`) — no Chatwoot/AgentMail
call — then send with an `Idempotency-Key` header.

**Polling vs push:** poll with `GET /api/v1/chat/conversations?updatedSince=…`
(and email list `updatedSince` where supported). For push, register an
**agent message webhook** (not under `/settings`):

```http
POST /api/v1/agent/message-webhooks
{ "url": "https://your.example/hooks/backsteros", "events": ["chat.message", "email.message"] }
# → { id, url, events, secret }  — store `secret` now; it is shown once

GET  /api/v1/agent/message-webhooks
DELETE /api/v1/agent/message-webhooks/{id}
```

Deliveries are `POST` JSON with HMAC headers `x-backsteros-timestamp`,
`x-backsteros-signature` (`sha256=` of `timestamp.body`), and
`x-backsteros-delivery-id`. Events fire for new inbound and outbound chat and
email messages. Requires `chat:read` or `email:read`.

```http
# Resolve contact
GET /api/v1/contacts/lookup?phone=%2B31%20(0)6%20461%2096%20570
GET /api/v1/contacts/lookup?email=jan%40example.com
GET /api/v1/contacts/lookup?channel=email&value=jan%40example.com
GET /api/v1/contacts/lookup?channel=x&value=123456789
GET /api/v1/contacts/lookup?instagram=jan

# List inboxes
GET /api/v1/chat/inboxes?channel=whatsapp
GET /api/v1/email/inboxes

# Email (AgentMail) — one-shot start
POST /api/v1/email/start
{ "inboxId": "…", "to": "jan@example.com", "subject": "Hi", "body": "…", "contactId": "…", "dryRun": true }
# dryRun returns the final rendered subject/body (greeting uses contact firstName, never the email local-part).
# Optional: "raw": true or "wrap": false to send body as-is; "status": "waiting"|"in_progress"|… (default waiting).
POST /api/v1/email/start
Idempotency-Key: email-2026-10-28-1
{ "inboxId": "…", "to": "jan@example.com", "subject": "Hi", "body": "…", "contactId": "…" }

# WhatsApp (template outside 24h → 422 template_required without template)
POST /api/v1/chat/conversations
{ "channel": "whatsapp", "contactId": "…", "content": "Hi {{1}}", "template": { "name": "hello", "category": "UTILITY", "language": "en", "processedParams": { "1": "Jan" } }, "dryRun": true }
POST /api/v1/chat/conversations
Idempotency-Key: wa-2026-10-28-1
{ "channel": "whatsapp", "contactId": "…", "content": "Hi Jan", "template": { "name": "hello", "category": "UTILITY", "language": "en" } }

# Instagram / Messenger (must be inside messaging window)
POST /api/v1/chat/conversations
{ "channel": "instagram", "contactId": "…", "content": "Hi", "dryRun": true }
POST /api/v1/chat/conversations
{ "channel": "messenger", "contactId": "…", "content": "Hi" }

# Telegram (no 24h window — needs a stored chat_id from a prior inbound; else 422 telegram_chat_unknown)
POST /api/v1/chat/conversations
{ "channel": "telegram", "contactId": "…", "content": "Hi" }

# X (numeric xUserId on the contact)
POST /api/v1/chat/conversations
{ "channel": "x", "contactId": "…", "content": "Hi" }

# Support ticket (subject required)
POST /api/v1/chat/conversations
{ "channel": "support", "contactId": "…", "subject": "Help with invoice", "content": "…" }

# Follow-up on an existing conversation
POST /api/v1/chat/conversations/{id}/messages
{ "content": "Follow-up" }
```

## Task images (screenshots)

Agents can attach JPEG/PNG/WebP/GIF screenshots the same way desktop paste does:

```http
# Raw bytes (same as desktop)
POST /api/v1/tasks/{id|KEY}/images
Content-Type: image/png
X-Filename: shot.png
<raw bytes, max 10 MB>

# JSON base64 (handy from agent tools)
POST /api/v1/tasks/{id|KEY}/images
Content-Type: application/json
{ "data": "<base64 or data-URL>", "contentType": "image/png", "filename": "shot.png", "alt": "bug" }

# Or inline on create / update / comment (appends ![alt](url) to description/body)
POST /api/v1/tasks
{ "title": "…", "projectKey": "OS", "images": [{ "data": "<base64>" }], "activityActor": "agent" }
POST /api/v1/tasks/OS-51/comments
{ "body": "See shot", "images": [{ "data": "<base64>", "alt": "ui" }], "activityActor": "agent" }

GET /api/v1/tasks/OS-51              # includes images[] (description-scoped)
GET /api/v1/tasks/OS-51/images
GET /api/v1/tasks/OS-51/images/{imageId}   # Bearer download; embed path in markdown
```

Requires `tasks:write` to upload and `tasks:read` to fetch. No public/signed URLs.
Max 5 images per JSON create/update/comment. SVG is rejected.

## AgentMail inbound webhooks

Register (or let core auto-register when `AGENTS_PUBLIC_URL` is set) a webhook
that POSTs to:

```text
https://agent.backsteros.com/api/v1/webhooks/agentmail
```

Core emits `email.updated` over `GET /api/v1/email/events` so backsteros/iOS
refetch messages. This door only forwards the webhook.

## Configure

```bash
cd agents
cp env.example .env
# edit CORE_UPSTREAM_URL — on VPS use http://127.0.0.1:8788
```

| Variable | Description |
| --- | --- |
| `CORE_UPSTREAM_URL` | Core API origin (required), no trailing slash. VPS: `http://127.0.0.1:8788` |
| `PORT` | Listen port (default `3080`) |
| `LISTEN_HOST` | Bind address (default `127.0.0.1`) |
| `REQUEST_TIMEOUT_MS` | Upstream timeout (default `120000`) |

## Run locally (dev)

From repo root:

```bash
pnpm install
pnpm --filter @backsteros/agents dev
```

Health: `GET http://127.0.0.1:3080/health`

## Deploy on the VPS

Routine deploys: `./deploy/agents/deploy-agents.sh` from the repo root (builds,
rsyncs to `lemodesign:/srv/backsteros/agents`, restarts the unit, then
`pnpm deploy:check --only=agents`; `--rollback` restores the previous build).
`/health` reports `build: { commit, builtAt, dirty }` from the `build-info.json`
that script writes.

First-time setup:

1. Cloud-core container listening on `127.0.0.1:8788` (see `deploy/cloud/`).
2. Build and run the proxy (systemd unit `backsteros-agents.service`):

```ini
[Unit]
Description=BacksterOS agents proxy
After=network-online.target

[Service]
WorkingDirectory=/srv/backsteros/agents
EnvironmentFile=/srv/backsteros/agents/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`.env` on the VPS:

```bash
CORE_UPSTREAM_URL=http://127.0.0.1:8788
PORT=3080
LISTEN_HOST=172.18.0.1
```

On lemodesign, Caddy (`lemodesign-caddy-1`) terminates TLS for
`agent.backsteros.com` and reaches the door on the Docker bridge at
`172.18.0.1:3080`.

## Verify

```bash
# Door health (proxy itself)
curl -sS "https://agent.backsteros.com/health"

# Through the door into cloud-core (expect 200 with a valid key)
curl -sS -H "Authorization: Bearer sk_live_…" \
  "https://agent.backsteros.com/api/v1/tasks?limit=1"

# Confirm upstream is cloud, not Mac: on the VPS,
# docker logs cloud-backsteros-1 --since 1m | grep '/api/v1/'
```

## Tests

```bash
pnpm --filter @backsteros/agents test
```
