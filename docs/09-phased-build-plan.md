# Phased build plan

Do not skip phases without explicit user approval. Each phase should be demoable.

## Phase 0 — Planning

**Workspace:** `~/code/backsteros/` (planning at root + code subfolders)

- [x] Architecture docs
- [x] User reviews and approves stack (Clerk, Neon, monorepo)
- [x] Choose domain names (`backsteros.com`, `service.backsteros.com`)

---

## Phase 1 — API foundation (in progress)

**Create code in:** `backsteros-api/`, `backsteros-packages/contracts/` (inside workspace)

| Task | Output | Status |
| --- | --- | --- |
| Postgres schema (tasks, projects, users) | Migrations | Done (local) |
| Hono + contracts skeleton | `/health`, OpenAPI | Done |
| Auth (session + API keys) | Clerk + `sk_live_` keys | Done (local) |
| REST `/api/v1/tasks`, `/projects` | CRUD | Done (local) |
| Neon project + connection string | Prod DB | **User** |
| Deploy API to VM | Kamal on DO droplet | **User** |

**Exit criteria:** Create task via REST; API key auth works. ✅ locally

**User setup:** See `backsteros-api/README.md`

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

| Task | Output |
| --- | --- |
| Vite + React at `/admin` | Owner-only shell |
| Sync health view | Cursor, devices, failed pushes (from API) |
| API health + log tail | Read-only ops endpoints on `backsteros-api` |
| Link to `/app` and OpenAPI docs | Cross-nav |

**Depends on:** Phase 1 API + Phase 3 sync metrics to display.

**Exit criteria:** Owner sees sync cursor and API health at `backsteros.com/admin`.

---

## Phase 4 — Expo mobile (MVP)

**Create:** `backsteros-mobile`

| Task | Output |
| --- | --- |
| Expo app + Expo Router | Login, inbox, tasks |
| PowerSync RN integration | Offline task list |
| Document open on demand | Content API fetch |

**Exit criteria:** Edit task offline on iPhone; syncs when online.

---

## Phase 5 — Product app (web + Tauri)

**Create:** `backsteros-app/`, `backsteros-desktop/`

| Task | Output |
| --- | --- |
| Vite + React at `/app` | Tasks, projects; uses `api-client` |
| PowerSync web | Same sync as mobile |
| Tauri loads app `dist/` | No Node sidecar |
| CodeMirror document editor | Open + save via API |

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

- Financial transactions (Tier C, append-only)
- Workout logs (Tier B/C split)
- Client portals (scoped API keys)
- backsteros-agent integration via API

---

## What to build first (recommended)

If user wants smallest vertical slice:

**Phase 1 + 2 + 4:** API + one document + Expo task list offline.

Skip Tauri until Phase 5 unless desktop is urgent.
