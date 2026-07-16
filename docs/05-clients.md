# Clients

## Three user-facing surfaces

| Surface | Folder | URL / package | Role |
| --- | --- | --- | --- |
| **Product app** | `backsteros-app/` | `app.backsteros.com` | Responsive web UI for daily work |
| **Ops admin** | `backsteros-admin/` | `admin.backsteros.com` | Logs, sync health, API observability — **not** task editing |
| **Mobile** | `backsteros-mobile/` | iOS/Android app | Same product concepts, native UI |

See [11-urls-and-routing.md](11-urls-and-routing.md) for path routing and deployment.

## Product app — `backsteros-app`

### Stacks

| Platform | How |
| --- | --- |
| Browser | Next.js 16 + React 19 at `app.backsteros.com` |
| Desktop | Separate client; does not load the web build |
| Mobile | Separate Expo codebase (shared `api-client`, not same bundle) |

The web app is responsive web only. Mobile and desktop are parallel clients.

### Features

- Inbox, tasks, projects, contacts, journal, knowledge, letters
- CodeMirror 6 for markdown; PDF viewer on demand
- PowerSync for offline metadata + sync push

### Repo structure (planned)

```text
backsteros-app/
  app/              Next.js routes and layouts
  components/       frontend-safe shell and UI
  lib/              navigation, environment, API client integration
```

## Ops admin — `backsteros-admin`

### Purpose

Owner dashboard for **system behavior**, not content editing.

- Sync status, cursor, device list, failed uploads
- API / service health, error log tail
- Storage and search index stats
- API key management (ops view)
- Link to OpenAPI docs on API host

### Stack

- Independent frontend stack optimized for tables and observability
- Online-first; PowerSync optional or omitted
- Same Clerk identity as the product app; **owner-only** routes

### Cross-link

- Admin header: “Open app” → `https://app.backsteros.com`
- App settings (owner): “Admin” → `https://admin.backsteros.com`

Separate folder so agents and builds stay focused — see [11-urls-and-routing.md](11-urls-and-routing.md).

## Mobile — Expo (`backsteros-mobile`)

- Product experience only — **not** admin
- Expo Router + PowerSync RN
- See prior mobile section patterns in this doc

### Offline

- Lists/tasks via local SQLite
- Document/PDF: fetch on open, discard on leave

## Desktop — Tauri (`backsteros-desktop`)

```text
backsteros-desktop/
  src-tauri/           Rust shell
  → separate native product client
```

Optional: menu item opens the web app or admin in the default browser.

## Shared packages

```text
backsteros-packages/
  api-client/          Used by app, admin, mobile
  contracts/           Zod / OpenAPI types
  ui-tokens/           Optional shared colors (optional)
```

## What clients must NOT do

- Put task/markdown CRUD in `backsteros-admin`
- Put ops log viewers in `backsteros-app` (except minimal “sync status” for users if needed later)
- Import server-only modules
- Store full vault / all PDFs locally

## Auth

- Clerk identity shared across product and admin hosts
- Admin: enforce owner role server-side
- API keys for agents: manageable from admin; not shipped in mobile bundles
