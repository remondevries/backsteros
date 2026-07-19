# Clients

## Four user-facing surfaces

| Surface | Folder | URL / package | Role |
| --- | --- | --- | --- |
| **Product web** | `backsteros-app/` | `backsteros.com/app` | Responsive web UI for daily work (Next.js) |
| **Product desktop** | `backsteros-desktop/` | Tauri app | Same product UX as web; Vite/React in Tauri 2 |
| **Ops admin** | `backsteros-admin/` | `backsteros.com/admin` | Logs, sync health, API observability — **not** task editing |
| **Mobile** | `backsteros-mobile/` | iOS/Android app | Same product concepts; **Expo** (not Tauri) |

See [11-urls-and-routing.md](11-urls-and-routing.md) for path routing and deployment.
Desktop decision: [10-decisions-log.md](10-decisions-log.md) ADR-019.

## Product web — `backsteros-app`

### Stacks

| Platform | How |
| --- | --- |
| Browser | Next.js 16 + React 19 at `backsteros.com/app` |
| Desktop | **Separate** Tauri + Vite/React client — see below (does **not** load this Next build) |
| Mobile | Separate Expo codebase (shared `api-client`, not same bundle) |

The web app is the canonical product UI for the browser. Desktop should feel the
same; mobile is a parallel native UI.

### Features

- Inbox, tasks, projects, contacts, journal, knowledge, letters
- CodeMirror 6 for markdown; PDF viewer on demand
- PowerSync for offline metadata + sync push

### Repo structure

```text
backsteros-app/
  app/              Next.js routes and layouts
  components/       frontend-safe shell and UI
  lib/              navigation, environment, API client integration
```

## Product desktop — Tauri (`backsteros-desktop`)

**Stack:** Tauri 2 + Vite + React SPA. Remote API only — **no** Node/Next sidecar.

```text
backsteros-desktop/
  src/                 Vite + React product UI
  src-tauri/           Rust shell
```

### Relationship to the web app

- Desktop product experience should be **very close or identical** to
  `backsteros-app` (same screens, flows, and interaction model).
- Implementation is a **Vite build** loaded by Tauri, not the Next.js standalone
  deployment. Next-only concerns (middleware, RSC, App Router handlers such as
  web avatars / settings proxies) stay on the web host; desktop talks to
  `service.backsteros.com` (and PowerSync) directly via shared clients.
- **Desktop-first shared UI:** polish product chrome and detail views in
  `@backsteros/ui` for **desktop first**. Do **not** deepen Next’s use of shared
  layout/detail views until desktop is the robust reference. Web keeps local
  screens under `backsteros-app/components/` until that gate. Thin helpers /
  skeletons already shared may stay; new web UI stays local.
- Shared **non-UI** packages (`api-client`, `contracts`, `powersync-schema`) are
  fine for both clients immediately.

### Separate from mobile

Desktop is **not** Expo and **not** shared with `backsteros-mobile`. Mobile uses
Expo + PowerSync RN (ADR-004). Desktop uses PowerSync web in the Tauri WebView.

### Offline and performance

- Lists/tasks via local SQLite (PowerSync)
- Document/PDF: fetch on open, discard on leave
- See [07-performance.md](07-performance.md)

Optional: menu item opens the web app or admin in the default browser.

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

- Admin header: “Open app” → `https://backsteros.com/app`
- App settings (owner): “Admin” → `https://backsteros.com/admin`

Separate folder so agents and builds stay focused — see [11-urls-and-routing.md](11-urls-and-routing.md).

## Mobile — Expo (`backsteros-mobile`)

- Product experience only — **not** admin
- Expo Router + PowerSync RN
- Separate framework from desktop (ADR-004 / ADR-019)

### Offline

- Lists/tasks via local SQLite
- Document/PDF: fetch on open, discard on leave

## Shared packages

```text
backsteros-packages/
  api-client/          Used by web, desktop, admin, mobile
  contracts/           Zod / OpenAPI types
  powersync-schema/    Shared Tier A/B client schema (web + desktop)
  ui/                  Shared product UI + helpers — desktop-first; Next later
  ui-tokens/           Optional shared colors (optional)
```

`@backsteros/ui` is framework-agnostic React (no `next/*`). Desktop is the
primary consumer of shared detail/layout views while those stabilize. Next may
keep thin helper/skeleton re-exports but should not deepen shared view adoption
until desktop polish lands. Next-only routing/auth stay in the web app shell.
## What clients must NOT do

- Put task/markdown CRUD in `backsteros-admin`
- Put ops log viewers in `backsteros-app` (except minimal “sync status” for users if needed later)
- Import server-only modules into desktop/mobile bundles
- Store full vault / all PDFs locally
- Embed Next.js or a Node API server inside Tauri
- Deepen Next adoption of `@backsteros/ui` detail/layout views before desktop polish is ready

## Auth

- Clerk identity shared across product web, desktop, admin, and mobile
- Admin: enforce owner role server-side
- API keys for agents: manageable from admin; not shipped in mobile bundles
