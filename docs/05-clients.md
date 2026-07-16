# Clients

## Three user-facing surfaces

| Surface | Folder | URL / package | Role |
| --- | --- | --- | --- |
| **Product app** | `backsteros-app/` | `backsteros.com/app`, Tauri desktop | Tasks, markdown, PDFs, daily work |
| **Ops admin** | `backsteros-admin/` | `backsteros.com/admin` | Logs, sync health, API observability — **not** task editing |
| **Mobile** | `backsteros-mobile/` | iOS/Android app | Same **product** as `/app`, native UI |

See [11-urls-and-routing.md](11-urls-and-routing.md) for path routing and deployment.

## Product app — `backsteros-app`

### Stacks

| Platform | How |
| --- | --- |
| Browser | Vite + React at `/app` |
| Desktop | Tauri loads `backsteros-app/dist` |
| Mobile | Separate Expo codebase (shared `api-client`, not same bundle) |

**One codebase** for web + Tauri desktop. Mobile is parallel native UI.

### Features

- Inbox, tasks, projects, contacts, journal, knowledge, letters
- CodeMirror 6 for markdown; PDF viewer on demand
- PowerSync for offline metadata + sync push

### Repo structure (planned)

```text
backsteros-app/
  src/
  lib/api/          api-client
  lib/sync/         PowerSync web
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

- Vite + React (lighter than product app — tables, charts, no CodeMirror/PDF)
- Online-first; PowerSync optional or omitted
- Same auth session as `/app`; **owner-only** routes

### Cross-link

- Admin header: “Open app” → `/app`
- App settings (owner): “Admin” → `/admin`

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
  → loads backsteros-app/dist (product, not admin)
```

No embedded Node server. Optional: menu item opens `/admin` in default browser.

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

- Login shared across `/app` and `/admin`
- Admin: enforce owner role server-side
- API keys for agents: manageable from admin; not shipped in mobile bundles
