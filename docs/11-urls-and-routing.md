# URLs, routing, and client split

## v2 hosts (local computer)

| URL | Code | Purpose |
| --- | --- | --- |
| `http://127.0.0.1:8788` | `core/server/` | REST, sync upload, OpenAPI (desktop / you / PTY) |
| `http://127.0.0.1:8080` | Docker PowerSync | Sync stream (or Tailscale MagicDNS `:8080`) |
| Desktop / mobile shells | `desktop/`, `mobile/` | UI only — talk to local core |

## Always-on agents (laptop may be offline)

| URL | Purpose |
| --- | --- |
| `https://agent.backsteros.com` | Public agents HTTPS door → **cloud-core** on the VPS |
| `http://100.75.45.22:8788` | Cloud-core on Tailscale (Hetzner `lemodesign`; same data twin) |

Always-on agents must use `https://agent.backsteros.com` (or VPS Tailscale
`:8788`). Do **not** point them at the Mac — that dies when the laptop sleeps.
Same `sk_live_…` keys work on cloud (replicated). Desktop / PTY stay on
local-core `127.0.0.1:8788`.

On the VPS, `backsteros-agents` must set `CORE_UPSTREAM_URL=http://127.0.0.1:8788`
(cloud-core loopback), **not** the Mac Tailscale URL.

## Other live hosts on the backsteros VPS

| URL | Purpose | In this repo? |
| --- | --- | --- |
| `https://automation.backsteros.com` | n8n | No |
| `https://client.lemo-design.com` | Client portal | No (separate repo) |

## Retired public hosts (410 Gone)

Cleaned up 2026-09-09. nginx keeps TLS certs and returns **410** so old bookmarks
fail clearly instead of 502:

| Host | Was |
| --- | --- |
| `https://backsteros.com` (+ `/app`, `/admin`) | Kamal Next product + admin |
| `https://app.backsteros.com` | Old product subdomain |
| `https://service.backsteros.com` | Cloud Kamal API |
| `https://sync.backsteros.com` | Cloud PowerSync |

`api.backsteros.com` DNS may still exist at Cloudflare but is **not** served from
this VPS. Do not revive cloud product/API hosts without an explicit ADR.

v1 Next apps were moved to `~/code/archive/backsteros-legacy/` (2026-09-09) — not part of this workspace.

## Why separate shell codebases

| | `desktop/` | `mobile/` |
| --- | --- | --- |
| **User goal** | Do work on macOS | Do work on iPhone / iPad |
| **Data** | PowerSync + rich editors | PowerSync + mobile layouts |
| **Offline** | Required | Required |
| **Share** | Contracts / api-client / schema only — **no** shared visual UI |

## Deployment (v2)

```text
local computer
  core/server     → http://127.0.0.1:8788
  PowerSync       → http://127.0.0.1:8080  (Docker)
  desktop/ / mobile/ → shells against local core (+ Tailscale when needed)

VPS (Hetzner lemodesign — 46.225.171.3 / Tailscale 100.75.45.22)
  cloud-core      → :8788 (Docker; Tailscale peer for replication)
  agents door     → https://agent.backsteros.com → kamal-proxy → :3080 → cloud-core
  portal / n8n    → kamal-proxy on same box
```


## Desktop Finance routes (v2)

| Path | Purpose |
| --- | --- |
| `/finance` | Full-width Finance; account picker dropdown; auto-select first account |
| `/finance/:accountSlug` | Account detail (transactions) |
| `/finance/:accountSlug/transactions` | Same (default section) |
| `/finance/:accountSlug/imports` | Recent CSV import batches |

No content side panel on Finance — switch/create accounts from the in-page dropdown.
Transactions load via REST (`GET /api/v1/bank-accounts/:id/transactions`); bank
accounts/categories may also appear via PowerSync Tier A.

## Auth (shells)

- Desktop / mobile: Clerk against local-core as configured in each shell
- API agents: `Authorization: Bearer sk_live_…` on cloud-core via the agents door
- Portal: its own session; server-side calls use a scoped API key to cloud-core
