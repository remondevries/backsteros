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

## Allowed traffic

All `/api/v1/*` routes are forwarded. Core enforces API key scopes (except the
AgentMail webhook route, which is Svix-authenticated).

Blocked at the door (never forwarded):

- PowerSync / sync / ops
- PTY sidecar (`/agent-pty`) — PTY stays local-only
- API key admin (`/api-keys`)

Attach a **contact** to each agent’s API key in Settings so comments and
activity show that person.

## AgentMail inbound webhooks

Register (or let core auto-register when `AGENTS_PUBLIC_URL` is set) a webhook
that POSTs to:

```text
https://agent.backsteros.com/api/v1/webhooks/agentmail
```

Core emits `email.updated` over `GET /api/v1/email/events` so desktop/iOS
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
LISTEN_HOST=127.0.0.1
```

nginx terminates TLS for `agent.backsteros.com` → `127.0.0.1:3080`.

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
