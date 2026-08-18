# BacksterOS Agents (VPS door)

Small HTTPS-facing proxy deployed on a VPS so **Grok Bot agents** (Sander and others) can reach BacksterOS **core** over the public internet. Core stays on Remon's local computer; this service is a **door**, not a second BacksterOS.

```text
iOS / desktop  --localhost or Tailscale-->  core (:8788)
Grok Bot       --HTTPS + scoped API key-->  VPS agents  --Tailscale-->  core
```

- Same Postgres and write pipeline as core — requests are forwarded, not reimplemented.
- Auth is unchanged: `Authorization: Bearer sk_live_…` keys issued by core.
- iOS and desktop **do not** use this service.

## Allowed traffic

Proxied `/api/v1` routes (everything else returns `403`):

| Area | Routes |
| --- | --- |
| Tasks | list, read, write, comments, activities, batch, reorder, move, triage — **not** task images |
| Markdown | documents CRUD + `/content` |
| Letters | metadata + `extractedText` on `GET /api/v1/letters/{id}` — **not** PDF or attachment bytes |
| Context | `GET /projects`, `GET /projects/{id}`, relations |
| Discovery | `GET /search`, `GET /global-search`, `GET /openapi.json` |

Blocked at the door (never forwarded):

- PowerSync / sync / ops
- PTY sidecar (`/agent-pty`)
- PDFs and letter attachment downloads
- Finance, settings, GitHub, vault filesystem, avatars, API key admin, org/contact CRUD, etc.

Core still enforces API key scopes on allowed routes.

## Prerequisites

1. **Core** running on the local computer (`hub` → Start all, or `pnpm dev` in `core/server`).
2. **Tailscale** on the VPS and on the machine running core, same tailnet.
3. A **scoped API key** from core (`tasks:read`, `tasks:write`, `documents:*`, `letters:read`, `search:query`, `projects:read` as needed — one key per agent later).

Note the core MagicDNS name or `100.x` address, e.g. `http://macbook.tail1234.ts.net:8788`.

## Configure

```bash
cd agents
cp env.example .env
# edit CORE_UPSTREAM_URL
```

| Variable | Description |
| --- | --- |
| `CORE_UPSTREAM_URL` | Tailscale URL to core (required), no trailing slash |
| `PORT` | Listen port (default `3080`) |
| `LISTEN_HOST` | Bind address (default `0.0.0.0`) |
| `REQUEST_TIMEOUT_MS` | Upstream timeout (default `120000`) |

## Run locally (dev)

From repo root:

```bash
pnpm install
pnpm --filter @backsteros/agents dev
```

Health: `GET http://127.0.0.1:3080/health`

## Deploy on a VPS

### 1. Tailscale

Install Tailscale on the VPS and approve it on the tailnet. Confirm core is reachable:

```bash
curl -sS "http://YOUR-CORE-HOST:8788/health"
```

### 2. Run the proxy

Build and run with systemd (or Docker). Example unit:

```ini
[Unit]
Description=BacksterOS agents proxy
After=network-online.target tailscaled.service

[Service]
WorkingDirectory=/opt/backsteros/agents
Environment=CORE_UPSTREAM_URL=http://YOUR-CORE-HOST:8788
Environment=PORT=3080
Environment=LISTEN_HOST=127.0.0.1
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Deploy steps on the VPS:

```bash
pnpm install --frozen-lockfile
pnpm --filter @backsteros/agents build
pnpm --filter @backsteros/agents start
```

Bind to `127.0.0.1` and terminate TLS in front (recommended).

### 3. HTTPS (Caddy example)

```caddy
agents.example.com {
  reverse_proxy 127.0.0.1:3080
}
```

Point Grok Bot at `https://agents.example.com/api/v1/…` with the Bearer key.

## Verify

```bash
# Through the VPS public URL:
curl -sS -H "Authorization: Bearer sk_live_…" \
  "https://agents.example.com/api/v1/tasks?limit=1"

# Blocked route (expect 403 from proxy, not core):
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer sk_live_…" \
  "https://agents.example.com/api/v1/letters/LETTER_ID/pdf"
# → 403
```

## Tests

```bash
pnpm --filter @backsteros/agents test
```
