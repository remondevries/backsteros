# Tech stack

Greenfield choices — not constrained by Circle’s current stack. See [10-decisions-log.md](10-decisions-log.md) for rejected alternatives.

## Summary table

| Layer | Choice | Runner-up |
| --- | --- | --- |
| Mobile | **Expo (SDK 52+) + Expo Router** | Flutter + PowerSync |
| Desktop client | **Tauri 2 + Vite + React** (ADR-019) | Electron; Next sidecar |
| Product web UI | **Next.js 16 + React 19 + Tailwind CSS 4** | Vite + React |
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

## Product web — Next.js

- Standalone server deployment at `backsteros.com/app`
- Production `basePath: /app` (`NEXT_PUBLIC_BASE_PATH`); local `next dev` may omit it
- Clerk Next.js middleware and sign-in
- Server components only for web concerns; all business rules remain in the API

## Desktop — Tauri 2 + Vite/React

- Folder: `backsteros-desktop/` (see ADR-019)
- Tauri 2 loads a **Vite + React** SPA — remote `backsteros-api` only
- **Does not** package or run the Next.js web build / Node sidecar
- Product UI should stay **near-identical** to `backsteros-app`; share packages /
  ports rather than inventing a second design language
- **Separate from Expo** (`backsteros-mobile`) — different framework, shared API
- PowerSync web SDK; Clerk SPA auth; M1-friendly memory target

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
