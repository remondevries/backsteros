# URLs, routing, and client split

## Domains and paths

Product and admin live as **path prefixes on the apex domain**. The API remains on
**`service.backsteros.com`** (`api.backsteros.com` unavailable).

| URL | Client folder | Purpose |
| --- | --- | --- |
| `https://backsteros.com/` | (optional landing) | Marketing; deep links into `/app` |
| `https://backsteros.com/app` | `backsteros-app/` | **Product UI** — Next.js with `basePath: /app` |
| `https://backsteros.com/admin` | `backsteros-admin/` | **Ops dashboard** — logs, sync health, API keys, storage — **not** task editing |
| `https://service.backsteros.com` | `backsteros-api/` | REST, sync, OpenAPI (no HTML product UI) |

Native desktop and mobile clients may share product concepts and API contracts,
but they do not load the Next.js web build.

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

- Same Clerk identity (host/session configuration permitting)
- Header link: App → `backsteros.com/admin` (owner only); Admin → `backsteros.com/app`
- Design tokens optional in `backsteros-packages/` — not a shared component library requirement

Do **not** merge into one SPA with heavy route guards — keeps bundles small and AI agent context clear.

## Deployment

```text
backsteros.com/app/*     → Next.js backsteros-app (basePath /app)
backsteros.com/admin/*   → backsteros-admin
service.backsteros.com/* → backsteros-api (Hono)
```

The product app is a standalone Next.js server (`output: "standalone"`), not a
static export. Nginx on the apex proxies `/app` to the Kamal proxy. Kamal still
routes the container by an internal Host (`app.backsteros.com` on the shared
proxy port); that hostname is **not** the public product URL.

Public health probe: `GET https://backsteros.com/app/api/health`.

Local `next dev` omits `NEXT_PUBLIC_BASE_PATH`, so the app runs at the origin root
(e.g. `http://localhost:5173`). Production builds set `NEXT_PUBLIC_BASE_PATH=/app`.

## Desktop and mobile

| Surface | Maps to |
| --- | --- |
| **Desktop** (`backsteros-desktop`) | Separate native client decision; not the Next.js web build |
| **Expo** (`backsteros-mobile`) | Native product UI — same API/sync, not admin |
| **Browser** | `backsteros.com/app` and `backsteros.com/admin` |

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

## Product app contents (`backsteros.com/app`)

- Inbox, tasks, projects, journal, knowledge, letters
- Markdown editing (CodeMirror), PDF viewing
- PowerSync offline
- User settings (vault path N/A on cloud; sync preferences)

## Auth

- Same identity provider for `/app` and `/admin`
- Clerk allowed origins use the **apex** (`https://backsteros.com`); paths are under `/app`
- **Admin routes:** restrict to owner role (or allowlist) in API + admin SPA
- API keys created in admin may be listed there; agents use keys outside browser

## CORS

Browser `Origin` for the product UI is `https://backsteros.com` (origins omit the
path). API `CORS_ORIGINS` must include that apex origin (and local dev origins).
