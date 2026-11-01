# Performance & DRY audit — 2026-10-31

**Scope (read-only):** `backsteros/` (desktop), `backsteros/packages/ui/`, `core/server/`, `core/packages/powersync-schema/`, `deploy/powersync/`, with mobile mirrors checked for DRY/SQL drift.  
**Not in scope:** implementing fixes, commits, mobile visual UI, Penpot/Meet apps.  
**Constraints recalled:** `docs/07-performance.md`, `docs/03-data-model.md` (no Tier C/D bulk sync), `docs/14-client-logic-inventory.md`.

## Method

| Signal | What ran |
| --- | --- |
| Static review | Re-render patterns, watched SQL, sync rules, routes, barrels, duplication |
| Bundle (existing `backsteros/dist/`, 2026-10-30) | Chunk sizes; gzip of entry JS/CSS |
| Postgres (local Docker `backsteros` @ `:5433`, read-only) | Row counts, index inventory, `EXPLAIN (ANALYZE, BUFFERS)` on hot shapes |

### Local DB scale (snapshot)

| Table | Live rows (approx.) |
| --- | --- |
| tasks | 1 477 |
| documents | 2 407 |
| task_activities | 24 274 (top task: **946** rows) |
| task_comments | 1 495 |
| sync_events | 18 095 (~11 MB relation; oldest 2026-07-16, no prune observed) |
| meetings | 76 |
| contacts | 268 |
| projects | 155 |

Dual comment body bytes: `task_comments.body` ≈ **879 KB**, `task_activities` comment bodies ≈ **882 KB** (near 1:1 duplication).

### Bundle snapshot (`backsteros/dist/assets`)

| Asset | Raw | gzip -9 |
| --- | --- | --- |
| `index-*.js` (main) | **8.0 MB** | **~1.58 MB** |
| `index-*.css` | **1.1 MB** | **~146 KB** |
| All JS chunks | **~28 MB** | — |
| Notable vendors | CodeMirror 754 KB, pdfjs 720 KB, PowerSync 522 KB, FullCalendar 265 KB, Nivo 374 KB; also mermaid/cytoscape/language packs as separate async chunks |

---

## Ranked findings

Impact = user-visible cost at current or near-term scale. Effort = S / M / L.

### 1. Main desktop entry JS is ~8 MB; import-time route preload cancels lazy loading

| | |
| --- | --- |
| **Issue** | Cold start parses a huge shell entry; `React.lazy` routes are warmed immediately when the router module loads, so keep-alive / finance / calendar / projects compete with first paint. |
| **File:line** | `backsteros/dist/assets/index-BeOpsa7b.js` (measured); `backsteros/src/router/shell-route-modules.ts:163–169`; `backsteros/src/lib/preload-shell-route-chunk.ts:167–169`; idle second pass `backsteros/src/shell/use-shell-chrome-state.ts:458–472` |
| **Evidence** | Entry JS **8.0 MB** raw / **1.58 MB** gzip. `if (typeof window !== "undefined") { void preloadShellRouteChunks(); }` and `preloadKeepAliveSectionChunks()` run at module evaluation. Total assets ~28 MB JS + 1.1 MB CSS. |
| **Impact** | **High** — startup / first interaction on M1 WebView. |
| **Effort** | **M** |
| **Suggested fix** | Remove top-level `void preload…()`; preload only on hover/intent/`requestIdleCallback` after first paint, capped to next-likely surfaces. Split more of shell chat / PDF / CodeMirror out of the entry (see #2). Prefer `@backsteros/ui/{shell,tasks,…}` entrypoints over the 5 721-line root barrel (`packages/ui/src/index.ts`). |

### 2. Shell chat always mounts PDF + assistant-ui + CodeMirror on the critical path

| | |
| --- | --- |
| **Issue** | Chrome always renders `ShellChatPanel`, which statically pulls the full chat stack (assistant-ui, LegendList, email-draft → CodeMirror, PDF overlay → react-pdf). |
| **File:line** | `backsteros/src/shell/shell-chrome.tsx:140–141`; `backsteros/src/shell/shell-chat-panel.tsx` (imports `ChatUiDevPreview`); `backsteros/packages/ui/src/components/chat/chat-thread.tsx:27`; `chat-email-draft-card.tsx:20`; `chat-pdf-overlay` / `letter-pdf-viewer` → `react-pdf` |
| **Evidence** | Manual chunks already isolate `vendor-codemirror` (754 KB) and `vendor-pdfjs` (720 KB), but shell import graph still forces them into early load when chat is part of chrome. `ChatUiDevPreview` is production shell chat, not a demo-only page. |
| **Impact** | **High** — inflate TTI even when chat is collapsed. |
| **Effort** | **M** |
| **Suggested fix** | Lazy-mount thread UI when panel opens; dynamic `import()` PDF thumbs and email-draft editor; split production `ShellChat` from preview/demo fixtures; extend `vite.manual-chunks` for `@assistant-ui/*`, `@legendapp/list`. |

### 3. Tracked-timer context ticks at 1 Hz across the whole shell

| | |
| --- | --- |
| **Issue** | While any timer runs, `setInterval` bumps `tick` every second and rebuilds the provider value (`timerTick` in deps), fan-out re-rendering all consumers. |
| **File:line** | `backsteros/packages/ui/src/tracked-timer/tracked-timer-context.tsx:300–308`, `:872–911`; mounted via shell providers |
| **Evidence** | `setTick` every 1000 ms; `useMemo` value includes `timerTick: tick` → new context identity each second. |
| **Impact** | **High** — shell-wide React work for the entire duration of a running timer. |
| **Effort** | **M** |
| **Suggested fix** | Split “actions” vs “tick/elapsed” contexts, or `useSyncExternalStore` per timer key so only mounted clock UIs subscribe. Keep action callbacks stable. |

### 4. Unbounded PowerSync list watches + meetings list pulls `notes`/`transcription`

| | |
| --- | --- |
| **Issue** | Authenticated desktop always watches full Tier A/B tables with no `LIMIT`. Meetings list SQL includes large text columns that the file header claims are omitted. Sync rules also stream those columns. |
| **File:line** | `backsteros/src/lib/workspace/workspace-sql.ts:1–7` (claim) vs `:258–282`, `:424` (includes `notes`, `transcription`); `use-desktop-workspace-data.tsx:187–237`; `deploy/powersync/sync-config.yaml:36` |
| **Evidence** | `MEETING_LIST_COLUMNS` lists `notes`, `transcription`. Provider watches `ALL_TASKS_LIST_SQL`, projects, contacts, orgs, documents, habits, meetings unconditionally. Local DB: 1 477 tasks + 2 407 documents always differential-compared. Docs (`docs/07-performance.md`) warn against full `useDesktopWorkspaceData` subscription. |
| **Impact** | **High** — memory, watch churn, and sync payload; worsens linearly with workspace growth. Transcription empty today locally (0 bytes) but schema/sync already pay the tax once populated. |
| **Effort** | **M** |
| **Suggested fix** | Drop `notes`/`transcription` from list SQL + prefer detail one-row watch / REST; narrow sync to preview-only. Split watches by surface; soft caps / windowed SQL; keep using slice hooks (`useDesktopWorkspaceTasks`, etc.) instead of the merged hook. |

### 5. Dual sync of comment bodies (`task_comments` + `task_activities`) and unbounded activity watches

| | |
| --- | --- |
| **Issue** | Comment `body` is stored/synced twice; client activity feeds watch all history with no SQL `LIMIT` (UI paginates in JS). |
| **File:line** | `deploy/powersync/sync-config.yaml:37–38`; desktop `task-activity-feed.ts` (activities + comments SQL); local measure: ~880 KB × 2; top task **946** activity rows |
| **Evidence** | Both tables in sync stream; activity counts up to 946/task; project activity panel already uses `LIMIT 20` (good contrast). |
| **Impact** | **High** — 2× network/SQLite; opening a busy task materializes hundreds of rows every watch invalidation. |
| **Effort** | **M–L** |
| **Suggested fix** | Finish cutover to `task_activities` only (or stop selecting `body` from one table). `LIMIT` + `deleted_at IS NULL` in SQL matching UI page size; cursor pagination. |

### 6. Agent chat live thread: full list re-render; virtualization only after 48 messages

| | |
| --- | --- |
| **Issue** | Each live update rebuilds `liveAgentThreadView` and drives `ChatThread` / external store with a new messages array. Below 48 messages, plain `.map` (no LegendList). Thinking/status rows rewrite list identity. |
| **File:line** | `backsteros/packages/ui/src/chat/live-agent-thread-state.ts` (`liveAgentThreadView`); `chat-thread.tsx:900–912`, `:1208`, threshold `:125` (`CHAT_THREAD_VIRTUALIZE_THRESHOLD = 48`) |
| **Evidence** | Non-virtual path maps every `ChatUiMessageBody` (memo helps rows, not parent work). Streaming + 8 s thinking poll still churn the parent. |
| **Impact** | **High** during active agent runs (token/status updates). |
| **Effort** | **M** |
| **Suggested fix** | Always virtualize (or lower threshold); isolate streaming body in a per-message store; keep thinking row outside the messages array identity; memoize `ChatThread` / split viewport vs composer. |

### 7. Server: unbounded `listTasks` / bootstrap + document search hybrid is slow

| | |
| --- | --- |
| **Issue** | Legacy list/bootstrap paths load entire tables. Document search combines FTS with `ILIKE` on title/path (and properties text in retrieve), defeating cheap index use. |
| **File:line** | `core/server/src/services/tasks-projects/task-listing.ts:37–90` (no `LIMIT`); sync bootstrap `bootstrap-pull.ts`; replication `fetchAllRows`; document search paths in `documents.ts` (~1087+) |
| **Evidence (EXPLAIN)** | `listTasks`-shaped query: **Seq Scan** on tasks, 1 477 rows, ~12 ms (fine now, unbounded). Document FTS+ILIKE pattern: **~103 ms**, 2 139 buffers touched; pure `@@` still Seq Scan at this scale despite `document_search_index_tsv_gin`. |
| **Impact** | **High** for agents/legacy clients and search UX as corpus grows. |
| **Effort** | **M** |
| **Suggested fix** | Require pagination / hard-cap legacy lists; page bootstrap. Prefer join/`@@` only for default search; drop properties `::text ILIKE` from default path. |

### 8. Missing GIN on task JSONB filters; linkedTasks enrichment scans documents

| | |
| --- | --- |
| **Issue** | Hot filters use `related_contact_ids` / org / email `@>` with **no GIN**. Paginated task enrichment ORs `properties->'linkedTasks'` across documents (string-equality branch blocks index use). |
| **File:line** | `task-listing.ts:202–228`, `:439–460`; CRM `relations.ts`; migrations add columns without GIN; `documents_properties_gin_idx` exists but OR/`->>` path still Seq Scans |
| **Evidence (EXPLAIN)** | `related_contact_ids @>` → **Seq Scan**, 0 GIN indexes on those columns. linkedTasks single-key filter → Seq Scan documents (~9.5 ms, 2 980 filtered). |
| **Impact** | **High** as tasks/docs grow and CRM/filters stay hot. |
| **Effort** | **S–M** |
| **Suggested fix** | `CREATE INDEX … ON tasks USING gin (related_contact_ids jsonb_path_ops)` (+ org/email). Maintain `document_task_links` or expression index; drop `->>'linkedTasks' =` from hot path; make enrichment optional. |

### 9. `sync_events` write amplification + no retention

| | |
| --- | --- |
| **Issue** | Each REST/leader mutation appends a sync event (often full snapshot) and nudges peers; bulk finance/habits fan out N events. Table grows without prune. |
| **File:line** | `core/server/src/services/sync-log.ts:17–38`, `:65–159`; `rest-sync-events.ts`; `leader-mutations.ts` habit fan-out; finance import loops |
| **Evidence** | Local: **18 095** events, **11 MB**, ~3+ months retained, avg payload ~109 chars (max 4 001). Pull by cursor is fast with `LIMIT` (0.4 ms for 500) — read path OK; write/storage path is the tax. |
| **Impact** | **Med–High** under import/habit storms; steady disk growth. |
| **Effort** | **M–L** |
| **Suggested fix** | Coalesce bulk imports; shrink payloads where apply allows; debounce peer nudges (100–500 ms); add cursor retention/archival. |

### 10. Unvirtualized message/email/project/social lists + unstable provider values

| | |
| --- | --- |
| **Issue** | Tasks overview / inbox side panel use `VirtualizedOverviewList`; many sibling surfaces still `.map` full trees. Several shell providers pass inline objects every render. |
| **File:line** | Email: `desktop-communication-email-thread.tsx:1636–1638`; DM: `communication-chat-view.tsx:785–793` (`MessageBubble` not memo’d); project tasks: `project-tasks-view.tsx:428–501`, `project-tasks-workbench-view.tsx:383–456`; social: `social-feed-view.tsx:1481–1501`; dropdown: `searchable-dropdown.tsx` options `.map`; providers: `list-keyboard-navigation-provider.tsx:692–699`, `content-side-panel-layout-context.tsx:28–30` |
| **Evidence** | Contrast with virtualized tasks overview. Keyboard nav provider rebuilds `{ register, setActiveZone, clearHighlights, activeZone }` every render → shell-wide consumers. |
| **Impact** | **Med–High** on long threads / large projects / open assignee menus. |
| **Effort** | **M** |
| **Suggested fix** | Reuse `VirtualizedOverviewList` / LegendList; `memo` row components + stable handlers; `useMemo` provider values; split `activeZone` into a narrow store. |

### 11. PowerSync client indexes missing for hot filters; watch throttle 32 ms

| | |
| --- | --- |
| **Issue** | Client schema indexes omit `deleted_at`, `inbox`, `due_date`, `start_at`, `journal_date`; meetings table has **no** PowerSync indexes. Desktop watch throttle is 32 ms (~30 Hz). |
| **File:line** | `core/packages/powersync-schema/src/index.ts:107–114` (tasks), `:373–395` (meetings, no indexes); `backsteros/src/lib/powersync-context.tsx:672–673` |
| **Evidence** | Inbox/calendar SQL filter `inbox` / `due_date` / `start_at`. Postgres has `tasks_workspace_due_date_idx` / meetings `start_at`, but SQLite client watches do not mirror those. |
| **Impact** | **Med** now; **High** as local SQLite grows. |
| **Effort** | **S–M** |
| **Suggested fix** | Add client indexes; raise throttle for large lists (100–250 ms); pass body-aware row comparators to CRM watches (avoid default `JSON.stringify`). |

### 12. Fat sync columns (descriptions, notes, `portal_password_hash`)

| | |
| --- | --- |
| **Issue** | Sync stream includes fields rarely needed offline or only needed on detail (and credentials hash on every client). |
| **File:line** | `deploy/powersync/sync-config.yaml:19–43` (contacts `portal_password_hash`, `notes`; tasks/projects descriptions; meetings notes/transcription; crm body; …) |
| **Evidence** | Desktop already omits task `description` from list SQL (`workspace-sql.ts`) and loads detail separately — sync still ships full text to SQLite. |
| **Impact** | **Med** bootstrap/delta size; security hygiene for password hash. |
| **Effort** | **M** |
| **Suggested fix** | Sync previews only; detail via REST/one-row watch; stop syncing `portal_password_hash` to shells. |

### 13. Agent chat server: unbounded threads/messages + N+1 mention hydrate

| | |
| --- | --- |
| **Issue** | `listChatThreads` loads all DM threads then all assistant messages for those IDs; `hydrateMessages` resolves mentions **per message**. |
| **File:line** | `core/server/src/services/agent-chat.ts:694–744`, `:581–607`; `resolve-chat-mentions.ts` per-token awaits |
| **Evidence** | `Promise.all(rows.map(… resolveChatMentionsInBody …))`; no thread/message list limits on those paths. Local chat volume is small today (33 messages) — pattern still scales poorly. |
| **Impact** | **Med** (becomes High with long agent DMs). |
| **Effort** | **M** |
| **Suggested fix** | Paginate threads; `DISTINCT ON` / lateral last message; batch mention tokens → one `IN (...)` per entity kind. |

### 14. `ensureSpacesHierarchy` on document list (write-on-read)

| | |
| --- | --- |
| **Issue** | Listing documents can create/update hierarchy and scan all knowledge docs. |
| **File:line** | `core/server/src/services/documents.ts:198–203`, `:251–324` |
| **Evidence** | `listDocuments` → `ensureSpacesHierarchy` → select all knowledge docs and may update. |
| **Impact** | **Med** — latency spikes and write amplification on GET. |
| **Effort** | **S–M** |
| **Suggested fix** | One-shot migration/ensure; never on GET; or memoize “hierarchy ready” per workspace. |

### 15. Monolithic UI CSS (~1.1 MB) + giant `@backsteros/ui` barrel

| | |
| --- | --- |
| **Issue** | Root imports all feature CSS; many screens import the full UI barrel. |
| **File:line** | `backsteros` `main.tsx` → `@backsteros/ui/styles.css` (~40 imports); `packages/ui/src/styles/` ~1.2 MB source; dist CSS **1.1 MB** / **146 KB** gzip; `packages/ui/src/index.ts` **5 721** lines |
| **Evidence** | Measured CSS asset size; barrel line count; Vite alias to source `index.ts`. |
| **Impact** | **Med** — CSS parse on every launch; wider module graph in dev. |
| **Effort** | **L** |
| **Suggested fix** | Route-scoped CSS packages; migrate imports to `@backsteros/ui/shell|tasks|…`; stop exporting heavy components from root barrel. |

### 16. DRY: inbox SQL drift (desktop vs mobile)

| | |
| --- | --- |
| **Issue** | Both files say “keep aligned” but predicates already diverge (`triage`, `waiting`, `IFNULL(inbox)`). |
| **File:line** | `backsteros/src/lib/workspace/inbox-task-query.ts:10–28`; `mobile/lib/inbox-tasks-sql.ts:14–36` |
| **Evidence** | Mobile includes `status = 'triage'` and omits `'waiting'`; desktop includes `'waiting'` and omits `'triage'`. |
| **Impact** | **Med** — correctness/perf (wrong membership → extra rows or missing inbox). |
| **Effort** | **S** |
| **Suggested fix** | Single shared SQL fragment / predicate builder in contracts or powersync-schema. |

### 17. DRY: working-pulse + Phase 7 pure-logic mirrors + backsterdev fork

| | |
| --- | --- |
| **Issue** | Near-identical pulse components in ui (task + project) and `backsterdev/`; large pure-logic inventory still mirrored mobile ↔ desktop. |
| **File:line** | `packages/ui/.../task-status-working-pulse.tsx`, `project-status-working-pulse.tsx`; `backsterdev/.../TaskStatusWorkingPulse.tsx`; inventory `docs/14-client-logic-inventory.md` |
| **Evidence** | Triplicated pulse/geometry; open inventory rows for due filters, inbox attention, email display id, merge helpers, sections, mention tokens, etc. |
| **Impact** | **Med** (maintenance / drift); pulse itself is CSS-motion and **not** a re-render hotspot. |
| **Effort** | **L** (inventory); **S** (pulse primitive) |
| **Suggested fix** | One pulse primitive with shape prop; continue Phase 7b extractions into `@backsteros/contracts` / client-logic in documented order; stop new backsterdev copy-pastes. |

### 18. N+1 label delete + `instr(label_ids)` full scan

| | |
| --- | --- |
| **Issue** | Deleting a label scans tasks and patches each matching row individually. |
| **File:line** | `backsteros` `use-task-labels.ts` (~241–267) |
| **Evidence** | `getAll` then per-row `patchMetadata`; `instr(label_ids, ?)` cannot use indexes. |
| **Impact** | **Med** — spiky uploads + watch storms. |
| **Effort** | **M** |
| **Suggested fix** | Server cascade or one local transaction batch; junction table for labels. |

### 19. CodeMirror language packs + xterm eager on feature routes

| | |
| --- | --- |
| **Issue** | File viewer static-imports many CM languages; task/inbox detail pulls xterm even if Terminal tab unused. Dist still ships large language chunks (emacs-lisp/cpp ~750 KB each). |
| **File:line** | `file-code-viewer.tsx` language imports; `task-shell-terminal.tsx` → task/inbox pages |
| **Evidence** | Dist language/vendor chunk sizes; mermaid already deferred (positive contrast). |
| **Impact** | **Low–Med** after fixing #1–#2. |
| **Effort** | **S–M** |
| **Suggested fix** | Dynamic `import()` per extension; mount terminal only when mode === `"terminal"`. |

### 20. Paginated task `ORDER BY` / count vs indexes; projects.`area` text unindexed

| | |
| --- | --- |
| **Issue** | Default sort uses expressions that don’t match `tasks_workspace_due_date_idx` cleanly; `includeTotalCount` double-counts; `projects.area` (text) filtered without index (`area_id` is indexed). |
| **File:line** | `task-listing.ts` paginated order/count; `projects.ts` area filter |
| **Evidence** | EXPLAIN projects `area =` → Seq Scan (small table today). |
| **Impact** | **Low–Med** |
| **Effort** | **S** |
| **Suggested fix** | Align ORDER BY with btree/expression index; approximate counts; filter via `area_id` or add `(workspace_id, area)`. |

---

## Already in good shape

- Tasks overview + inbox side panel: `VirtualizedOverviewList` / LegendList.
- Agent chat ≥48 messages: LegendList path; `ChatUiMessageBody` memo’d; live-thread reducer stability helpers.
- Working pulses: CSS motion + `useSyncExternalStore` for color scheme only — **not** a timer re-render hotspot.
- Desktop list SQL mostly explicit columns; task `description` / letter `context` omitted from lists as documented (meetings are the exception — #4).
- `differentialWatch` + `WORKSPACE_LIST_ROW_COMPARATOR` avoid full-row stringify on main lists.
- PowerSync provider value identity guard; finance transactions not in sync-config (Tier C).
- Mermaid dynamic import; Tauri IPC profiling already moved `system_stats` to push events (`docs/15-tauri-ipc-profiling.md`).
- `sync_events` cursor pull indexed and fast with `LIMIT`.
- Postgres: solid coverage for workspace/project/assignee/due/follow-up; documents properties GIN; chat message `(thread_id, created_at)` indexes.

---

## Suggested remediation order

1. Kill import-time preloads + shrink shell entry (#1, #2, #15).  
2. Split tracked-timer tick subscriptions (#3).  
3. Fix meetings list/sync fat columns; LIMIT activity watches; end dual comment sync (#4, #5).  
4. Always-virtualize agent chat; virtualize email/DM/project lists; stabilize shell providers (#6, #10).  
5. Cap legacy REST lists; GIN on task JSONB; fix document search hybrid; page bootstrap (#7, #8).  
6. Coalesce sync_events + retention; debounce nudges (#9).  
7. Client PowerSync indexes + watch throttle; narrow sync payloads (#11, #12).  
8. Agent-chat hydrate batching; remove ensure-on-list (#13, #14).  
9. Unify inbox SQL + Phase 7b DRY (#16, #17).  

---

## Top 10 summary

1. **8 MB main JS + import-time route preload** — lazy routes don’t protect first paint.  
2. **Shell chat eagerly pulls PDF / assistant-ui / CodeMirror** — critical path even when collapsed.  
3. **Tracked-timer 1 Hz context** — shell-wide re-renders while any timer runs.  
4. **Unbounded PowerSync watches; meetings list/sync include notes/transcription** — contradicts lean-list rules.  
5. **Dual comment sync + unbounded activity watches** — ~2× body storage; tasks with 900+ activity rows.  
6. **Agent ChatThread churn; virtualize only after 48 msgs** — hot during streaming.  
7. **Unbounded server list/bootstrap; document FTS+ILIKE ~103 ms** on local corpus.  
8. **No GIN on task JSONB filters; linkedTasks enrichment Seq Scans documents.**  
9. **`sync_events` amplification / no retention** — 18k rows / 11 MB locally and growing.  
10. **Unvirtualized email/DM/project/social lists + unstable shell providers** — missing the virtualization already used on Tasks/inbox.

---

*Audit only — this file left uncommitted by request. No application code changed.*
