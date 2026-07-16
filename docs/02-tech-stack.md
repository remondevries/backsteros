# Tech stack

Greenfield choices — not constrained by Circle’s current stack. See [10-decisions-log.md](10-decisions-log.md) for rejected alternatives.

## Summary table

| Layer | Choice | Runner-up |
| --- | --- | --- |
| Mobile | **Expo (SDK 52+) + Expo Router** | Flutter + PowerSync |
| Desktop shell | **Tauri 2** | Electron |
| Web / desktop UI | **Vite + React** | Next.js (only if SSR/marketing site needed) |
| Markdown editor | **CodeMirror 6** | — |
| Server metadata DB | **PostgreSQL 17** | — |
| Blob storage | **Backblaze B2** or **Cloudflare R2** | DO Spaces |
| Search | **Meilisearch** | Typesense |
| Offline sync | **PowerSync** | Custom sync on Postgres |
| API service | **Hono + ts-rest + OpenAPI** | Supabase PostgREST + Edge Functions |
| Realtime (open docs) | **SSE/WebSocket in API** | Supabase Realtime |
| Auth | **Clerk** (Hobby) | Supabase Auth |

## Mobile — Expo

- Native iOS/Android; strong AI docs (Skills, MCP, `AGENTS.md`, llms.txt)
- PowerSync official React Native SDK
- Avoid: Tauri iOS, WebView-wrapped Next.js

## Desktop — Tauri + Vite

- Native window; system WebView (light vs Electron)
- **No embedded Next.js/Node server** — frontend build only, talks to remote API
- PowerSync Web SDK for offline SQLite in browser engine

## Backend — PostgreSQL

- SQL for tasks, money, workouts, audit trails
- PowerSync replication from Postgres
- **Prod host:** [Neon](https://neon.tech) (Free → Launch). **Dev:** Docker Compose locally.
- Neon: official PowerSync integration; enable logical replication in console for Phase 3.

## Blobs — B2 or R2

| Provider | When |
| --- | --- |
| **Backblaze B2** | Cheapest storage at rest (~$0.70/mo for 100 GB) |
| **Cloudflare R2** | Heavy PDF download / egress (zero egress fees) |

Postgres stores `storage_key`, `size`, `checksum`, `snippet` — never PDF bytes.

## Search — Meilisearch

- Knowledge-base search; typo tolerance; hybrid semantic + keyword
- Self-host (MIT) or cloud
- Agents use API `GET /api/v1/search` — not direct Meilisearch exposure

## Sync — PowerSync

- Offline writes on mobile, web, desktop
- **Sync rules** = partial sync (metadata only, not 100 GB)
- Upload queue validates against `backsteros-api`

**Not chosen:** Convex (weak offline mobile), Zero alone (no offline writes), ElectricSQL alone (incomplete offline writes path), Replicache (maintenance / web-only).

## API — Hono + ts-rest

- OpenAPI for agents and portals
- Versioned `/api/v1`
- PowerSync `uploadData` handler calls same domain logic as REST

## Alternative “fewer vendors” stack

**Supabase** (Postgres + Auth + Storage + Realtime) + **PowerSync** + **Meilisearch** sidecar.

Use if you want less custom infra; tradeoff is less bespoke OpenAPI and more Supabase-shaped agent contracts.

## AI agent tooling

| Tool | Role |
| --- | --- |
| This repo `AGENTS.md` + `docs/` | Architecture source of truth |
| `docs/llms.txt` | Doc discovery index |
| OpenAPI spec (future) | Generated client + agent contracts |
| Expo Skills / MCP | When building mobile |

Markdown is the doc format — universal for Cursor, Claude, Codex. Structured index (`llms.txt`) beats a single giant file for token efficiency.
