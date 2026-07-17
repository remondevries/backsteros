# Vision

## What we are building

**BacksterOS** is a personal productivity platform that combines:

- Tasks, projects, inbox, contacts, organizations
- Knowledge base and project documents (markdown)
- Daily journal
- Letters (incoming PDF mail)
- Future: financial transactions, workout logs, larger media libraries

The product should feel **fast** (Linear-like), work **offline** on phone and desktop, and expose a **stable API** for client portals and AI agents.

## Who it is for

- Primary user: single owner (personal workspace)
- Secondary consumers: AI agents, automation scripts, client portals (via API keys)

## Core goals

1. **Separation of concerns** — UI repos are thin; backend owns data, sync, search, files.
2. **Offline-first** — local SQLite on clients; push when online; no spinners for reads.
3. **Cheap at scale** — 100+ GB PDFs and 1500+ markdown files; metadata syncs, bodies on demand.
4. **Agent collaboration** — human and AI can work on the same markdown file with near-instant updates.
5. **Bulk operations** — select 100+ tasks and change properties in one transaction (future).
6. **Snappy on modest hardware** — iPhone 16, MacBook M1; low memory footprint.

## Inspiration

- **Linear** — ordered sync, fast local UI, single API for all clients
- **Google Drive** (for files) — searchable index locally; open file → fetch content
- **Circle** (legacy) — feature scope reference; architecture is not copied

## Non-goals (v1)

- Multi-tenant SaaS with billing
- Character-level CRDT co-editing (Google Docs style) — document-level live sync is enough for v1
- Replacing backsteros-agent (Cursor console) — may integrate via API later
- Migrating all Circle data on day one — phased cutover

## Success criteria

| Criteria | Measure |
| --- | --- |
| Offline mobile | Create/edit tasks with no network; sync on reconnect |
| Agent read | `GET /api/v1/search` + `GET /api/v1/documents/{id}/content` without repo access |
| Agent + human edit | Agent PATCH → open editor updates in &lt; 2 s |
| Desktop | Tauri 2 + Vite/React; UI ≈ web app; no Node/Next sidecar (ADR-019) |
| Storage cost | 100 GB PDFs in object storage, not Postgres or device |

## Relationship to Circle

Circle (`circle.remondevries.com`) is a **legacy monolith**: Next.js + SQLite + Tauri + Vite mobile shims + DO Spaces. BacksterOS **replaces** that architecture. See [08-legacy-circle.md](08-legacy-circle.md).
