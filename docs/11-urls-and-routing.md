# URLs, routing, and client split

## Domains and paths

Single marketing/product domain **`backsteros.com`** with path-based apps. API on **`service.backsteros.com`** (`api.backsteros.com` unavailable).

| URL | Client folder | Purpose |
| --- | --- | --- |
| `https://backsteros.com/` | (optional landing) | Marketing or redirect → `/app` |
| `https://backsteros.com/app` | `backsteros-app/` | **Product UI** — tasks, projects, markdown, PDFs |
| `https://backsteros.com/admin` | `backsteros-admin/` | **Ops dashboard** — logs, sync health, API keys, storage — **not** task editing |
| `https://service.backsteros.com` | `backsteros-api/` | REST, sync, OpenAPI (no HTML product UI) |

Tauri desktop and Expo mobile use the **same product experience as `/app`**, not `/admin`.

## Why two front-end codebases

| | `backsteros-app` | `backsteros-admin` |
| --- | --- | --- |
| **User goal** | Do work (tasks, docs, letters) | Observe system (sync, errors, usage) |
| **Data** | PowerSync + rich editors | Read-mostly metrics, logs, tables |
| **Offline** | Required | Online-only is fine |
| **Complexity** | CodeMirror, PDF, navigation | Charts, log tail, status cards |
| **Audience** | Daily use | Owner / power user |

Different UX and dependencies → **separate folders**, shared `backsteros-packages/api-client` and auth.

## Cross-linking

Both apps may share:

- Same login session (cookie domain `backsteros.com`)
- Header link: App → “Admin” (owner only); Admin → “Open app”
- Design tokens optional in `backsteros-packages/` — not a shared component library requirement

Do **not** merge into one SPA with heavy route guards — keeps bundles small and AI agent context clear.

## Deployment (reverse proxy)

```text
backsteros.com/app/*    → static build from backsteros-app/
backsteros.com/admin/*  → static build from backsteros-admin/
service.backsteros.com/*    → backsteros-api (Hono)
```

Kamal, Caddy, or Cloudflare can path-route two static sites on one domain.

## Desktop and mobile

| Surface | Maps to |
| --- | --- |
| **Tauri** (`backsteros-desktop`) | Loads `backsteros-app` build (same as `/app`) |
| **Expo** (`backsteros-mobile`) | Native product UI — same API/sync, not admin |
| **Browser** | `/app` and `/admin` as above |

Optional: Tauri could open `/admin` in system browser for ops — not embedded in product shell v1.

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

## Product app contents (`/app`)

- Inbox, tasks, projects, journal, knowledge, letters
- Markdown editing (CodeMirror), PDF viewing
- PowerSync offline
- User settings (vault path N/A on cloud; sync preferences)

## Auth

- Same identity provider for `/app` and `/admin`
- **Admin routes:** restrict to owner role (or allowlist) in API + admin SPA
- API keys created in admin may be listed there; agents use keys outside browser
