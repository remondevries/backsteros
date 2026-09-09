# Phased build plan

Do not skip phases without explicit user approval. Each phase should be demoable.

## Phase 0 — Planning

**Workspace:** `~/code/backsteros/` (planning at root + code subfolders)

- [x] Architecture docs
- [x] User reviews and approves stack (Clerk, local Docker Postgres, monorepo)
- [x] Local-computer core host model (v2) — no cloud API required

---

## Phase 1 — API foundation (in progress)

**Create code in:** `core/server/`, `core/packages/contracts/` (inside workspace)

| Task | Output | Status |
| --- | --- | --- |
| Postgres schema (tasks, projects, users) | Migrations | Done (local) |
| Hono + contracts skeleton | `/health`, OpenAPI | Done |
| Auth (session + API keys) | Clerk + `sk_live_` keys | Done (local) |
| REST `/api/v1/tasks`, `/projects` | CRUD | Done (local) |
| Docker Postgres + PowerSync | Local DB / sync | Done |

**Exit criteria:** Create task via REST; API key auth works. ✅ locally

**User setup:** See `core/server/README.md`

**No mobile/desktop yet.** Prove API with curl + Bruno/Postman.

**Exit criteria:** Create task via REST; API key auth works.

---

## Phase 2 — Object storage + documents

| Task | Output |
| --- | --- |
| B2/R2 bucket + credentials | Storage adapter |
| Document metadata in Postgres | Tier B rows |
| `GET/PATCH /documents/{id}/content` | Lazy body fetch/write |
| Meilisearch sidecar | Index on save |
| `GET /api/v1/search` | Agent search |

**Exit criteria:** Agent can search and read/write one markdown doc via API.

---

## Phase 3 — PowerSync + unified sync

| Task | Output |
| --- | --- |
| PowerSync service + Postgres replication | Sync rules for Tier A/B |
| `/sync/push` validation in API | Batch mutations |
| `sync_events` table | Cursor pull |

**Exit criteria:** Web test client syncs tasks offline (PowerSync web demo).

---

## Phase 3b — Ops admin dashboard

**Create:** `backsteros-admin/`

| Task | Output | Status |
| --- | --- | --- |
| Next.js + Clerk at `/admin` | Owner-only shell | Done (local) |
| API health probe | `/health` in admin UI | Done (local) |
| Sync health view | Cursor, devices (`/api/v1/ops/sync-health`) | Done (local) |
| API health + log tail | `/api/v1/ops/logs` ring buffer | Done (local) |
| Link to `/app` and OpenAPI docs | Cross-nav | Done (local) |

**Depends on:** Phase 1 API + Phase 3 sync metrics to display.

**Exit criteria (v1):** Owner sees sync cursor and API health in admin UI.
**v2 note:** Cloud `/admin` is retired (410). Ops health is local-core / Hub / desktop.

---

## Phase 4 — Expo mobile (MVP)

**Create:** `backsteros-mobile`

| Task | Output | Status |
| --- | --- | --- |
| Expo app + Expo Router | Login, inbox, tasks | Done (local) |
| PowerSync RN integration | Offline task list + status edits; SQL.js (Expo Go) / Quick SQLite (native builds) | Done (local) |
| Document open on demand | Content API fetch | Next |

**Exit criteria:** Edit task offline on iPhone; syncs when online.

---

## Phase 5 — Product app (web + Tauri)

**Folders (historical):** Next product web → `~/code/archive/backsteros-legacy/`; active UI is `desktop/` (Tauri).

**v2:** Next.js at `backsteros.com/app` is **retired** (410 Gone, ADR-020). Desktop
is the product shell (ADR-019) — not a Next sidecar and not Expo.

| Task | Output |
| --- | --- |
| Next.js product at `/app` | Tasks, projects, letters, etc.; uses `api-client` |
| PowerSync web (browser + desktop SPA) | Same sync model as mobile metadata |
| Scaffold `backsteros-desktop` | Tauri 2 + Vite/React; remote API only |
| Align desktop UI with `backsteros-app` | Shared packages / ports; near-identical UX |
| CodeMirror document editor | Open + save via API (web first; desktop parity) |
| Desktop packaging / CI | Tauri build + optional Apple/Windows signing (`desktop-release.yml`) |

**Exit criteria:** Same task visible on phone, `/app`, and Tauri after sync.

---

## Phase 6 — Live documents + agent collaboration

| Task | Output |
| --- | --- |
| Document subscribe SSE/WS | Open editor registration |
| Agent PATCH triggers push | &lt; 2 s UI update |
| Conflict UI | Review agent changes |

**Exit criteria:** Agent PATCH while doc open → editor updates without manual refresh.

---

## Phase 7 — Letters, journal, knowledge parity

| Task | Output |
| --- | --- |
| Letter PDF metadata + presigned URLs | Tier B + D |
| Journal + knowledge paths | Storage keys |
| PDF text extraction → Meilisearch | Search letters |

**Exit criteria:** Feature parity with Circle core areas.

---

## Phase 8 — Circle migration + cutover

| Task | Output |
| --- | --- |
| Data migration scripts | SQLite → Postgres, Spaces → B2 |
| Bulk task edit UI | Batch mutation |
| Retire Circle Kamal deploy | DNS cutover |

---

## Phase 9 — Future domains

### Finance v1 (desktop-first) — in progress

| Task | Output |
| --- | --- |
| Bank accounts + categories (Tier A) | Postgres + PowerSync + REST |
| CSV import (ING NL / AMEX NL) | `POST /bank-accounts/:id/imports` |
| Transactions (Tier C) | Paginated list + classification PATCH/batch |
| Desktop Finance UI | Account switcher dropdown, month→week list, search, bulk edit |

- Workout logs (Tier B/C split)
- Client portals (scoped API keys)
- backsteros-agent integration via API

---

## What to build first (recommended)

If user wants smallest vertical slice:

**Phase 1 + 2 + 4:** API + one document + Expo task list offline.

Skip Tauri until desktop is urgent; when starting desktop, follow ADR-019
(Tauri 2 + Vite/React, UI aligned with `backsteros-app`, separate from Expo).
