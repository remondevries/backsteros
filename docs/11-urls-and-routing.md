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
| `http://100.117.142.79:8788` | Cloud-core on Tailscale (same data twin) |

Always-on agents must use `https://agent.backsteros.com` (or VPS Tailscale
`:8788`). Do **not** point them at the Mac (`100.94.74.107` / MagicDNS) — that
dies when the laptop sleeps. Same `sk_live_…` keys work on cloud (replicated).
Desktop / PTY stay on local-core `127.0.0.1:8788`.

On the VPS, `backsteros-agents` must set `CORE_UPSTREAM_URL=http://127.0.0.1:8788`
(cloud-core loopback), **not** the Mac Tailscale URL.

Cloud product hosts (`backsteros.com/app`, `service.backsteros.com`) belonged to
v1 / early hosting experiments and are **not** part of active v2.

## Why separate shell codebases

| | `desktop/` | `mobile/` |
| --- | --- | --- |
| **User goal** | Do work on macOS | Do work on iPhone / iPad |
| **Data** | PowerSync + rich editors | PowerSync + mobile layouts |
| **Offline** | Required | Required |
| **Share** | Contracts / api-client / schema only — **no** shared visual UI |

## Historical note (v1 Next.js paths)

Earlier docs described `backsteros.com/app` and `backsteros.com/admin` Next.js
apps. Those live under `legacy/` for reference only — do not extend them.

## Cross-linking

Both apps may share:

- Same Clerk identity (host/session configuration permitting)
- Header link: App → `backsteros.com/admin` (owner only); Admin → `backsteros.com/app`
- Design tokens optional in `backsteros-packages/` — not a shared component library requirement

Do **not** merge into one SPA with heavy route guards — keeps bundles small and AI agent context clear.

## Deployment (v2)

```text
local computer
  core/server     → http://127.0.0.1:8788
  PowerSync       → http://127.0.0.1:8080  (Docker)
  desktop/ / mobile/ → shells against local core (+ Tailscale when needed)
```

Cloud Kamal / nginx / Neon deployments are retired.

## Desktop and mobile

| Surface | Maps to |
| --- | --- |
| **Desktop** (`backsteros-desktop`) | Tauri 2 + Vite/React SPA (ADR-019); near-identical product UX to web; **not** the Next.js build |
| **Expo** (`backsteros-mobile`) | Native product UI — same API/sync, **not** the desktop framework, not admin |
| **Browser** | `backsteros.com/app` and `backsteros.com/admin` |

Desktop routing uses **TanStack Router** (`@tanstack/react-router`). Typed search params cover tasks (`due` / `view`) and calendar page mode. Product URLs are unchanged from this doc; only the router implementation moved off `react-router-dom`.

**Shared logic (not shared UI):** Pure helpers shared by desktop and mobile live under `@backsteros/contracts` (e.g. `client-logic/task-due-date.ts`). Inventory and extraction backlog: [`docs/14-client-logic-inventory.md`](14-client-logic-inventory.md). Do not share React components or CSS between `mobile/` and `desktop/`.

Optional: Tauri could open `/admin` (or the web app) in the system browser for
ops — not embedded in the product shell v1.

## Admin dashboard contents (planned)

Not task CRUD. Examples:

- API health, version, uptime
- Sync: cursor lag, failed pushes, devices online
- PowerSync / Postgres connection status
- Recent API errors (from structured logs)
- Storage: bucket size, object count
- Meilisearch index stats
- API keys management (may duplicate Settings in app later — admin is source for ops)
- Link to OpenAPI `/docs` on API host

## Product app contents (`backsteros.com/app`)

- Inbox, tasks, projects, journal, knowledge, letters
- Markdown editing (CodeMirror), PDF viewing
- PowerSync offline
- User settings (vault path N/A on cloud; sync preferences)

## Desktop Finance routes (v2)

| Path | Purpose |
| --- | --- |
| `/finance` | Full-width Finance; account picker dropdown; auto-select first account |
| `/finance/:accountSlug` | Account detail (transactions) |
| `/finance/:accountSlug/transactions` | Same (default section) |
| `/finance/:accountSlug/imports` | Recent CSV import batches |

No content side panel on Finance — switch/create accounts from the in-page dropdown. Transactions load via REST (`GET /api/v1/bank-accounts/:id/transactions`); bank accounts/categories may also appear via PowerSync Tier A.

## Auth

- Same identity provider for `/app` and `/admin`
- Clerk allowed origins use the **apex** (`https://backsteros.com`); paths are under `/app`
- **Admin routes:** restrict to owner role (or allowlist) in API + admin SPA
- API keys created in admin may be listed there; agents use keys outside browser

## CORS

Browser `Origin` for the product UI is `https://backsteros.com` (origins omit the
path). API `CORS_ORIGINS` must include that apex origin (and local dev origins).
