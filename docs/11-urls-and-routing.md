# URLs, routing, and client split

## Domains and paths

Product, admin, and API are independently deployable hosts. The API remains on
**`service.backsteros.com`** (`api.backsteros.com` unavailable).

| URL | Client folder | Purpose |
| --- | --- | --- |
| `https://backsteros.com/` | (optional landing) | Marketing or redirect → `app.backsteros.com` |
| `https://app.backsteros.com` | `backsteros-app/` | **Product UI** — standalone Next.js web app |
| `https://admin.backsteros.com` | `backsteros-admin/` | **Ops dashboard** — logs, sync health, API keys, storage — **not** task editing |
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
- Header link: App → `admin.backsteros.com` (owner only); Admin → `app.backsteros.com`
- Design tokens optional in `backsteros-packages/` — not a shared component library requirement

Do **not** merge into one SPA with heavy route guards — keeps bundles small and AI agent context clear.

## Deployment

```text
app.backsteros.com/*      → standalone Next.js backsteros-app
admin.backsteros.com/*    → backsteros-admin
service.backsteros.com/*  → backsteros-api (Hono)
```

The product app is a server deployment, not a Vite static export. Its health
probe is `GET https://app.backsteros.com/api/health`.

## Desktop and mobile

| Surface | Maps to |
| --- | --- |
| **Desktop** (`backsteros-desktop`) | Separate native client decision; not the Next.js web build |
| **Expo** (`backsteros-mobile`) | Native product UI — same API/sync, not admin |
| **Browser** | `app.backsteros.com` and `admin.backsteros.com` |

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

## Product app contents (`app.backsteros.com`)

- Inbox, tasks, projects, journal, knowledge, letters
- Markdown editing (CodeMirror), PDF viewing
- PowerSync offline
- User settings (vault path N/A on cloud; sync preferences)

## Auth

- Same identity provider for `/app` and `/admin`
- **Admin routes:** restrict to owner role (or allowlist) in API + admin SPA
- API keys created in admin may be listed there; agents use keys outside browser
