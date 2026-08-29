# Decisions log (ADR)

Architecture decisions from planning sessions. Status: **Accepted** unless noted.

---

## ADR-001: Thin clients + central API

**Status:** Accepted  
**Context:** Circle monolith causes AI agent confusion and platform branching.  
**Decision:** All business logic in `backsteros-api`; UI repos are clients only.  
**Consequences:** Multiple repos; clear OpenAPI contract required.

---

## ADR-002: PostgreSQL over server SQLite

**Status:** Accepted  
**Context:** Future money, workouts, portals, concurrency.  
**Decision:** Postgres 17 for all metadata and sync events.  
**Alternatives rejected:** SQLite on server (Circle today), Convex document DB.

---

## ADR-003: PowerSync for offline sync

**Status:** Accepted  
**Context:** Need offline iOS, desktop, web with partial sync.  
**Decision:** PowerSync with Postgres backend and sync rules.  
**Alternatives rejected:**
- Convex (no native offline mobile)
- Zero alone (no offline writes)
- ElectricSQL alone (incomplete write path)
- Custom sync only (higher cost; Circle already proved concept)

---

## ADR-004: Expo for mobile (not Tauri iOS)

**Status:** Accepted  
**Context:** Native app, AI agent tooling, avoid Next.js shims.  
**Decision:** Expo + Expo Router + PowerSync RN.  
**Alternatives rejected:** Tauri iOS, Capacitor + web app.

---

## ADR-005: Tauri for desktop (no Node sidecar)

**Status:** Superseded by ADR-019.  
**Context:** User wants native window; M1 memory constraints.  
**Decision:** Tauri 2 loads Vite static build; remote API only.  
**Alternatives rejected:** Electron; Tauri + embedded Next server (Circle pattern).

---

## ADR-006: Vite + React over Next.js for app UI

**Status:** Superseded by ADR-018.
**Context:** Client-only app; no SSR required for main shell.  
**Decision:** Vite + React for `backsteros-app` (product at `/app`).  
**Note:** Ops UI is separate `backsteros-admin` at `/admin` — see ADR-015.
**Note:** Next.js acceptable for separate marketing/SEO site only.

---

## ADR-007: Object storage B2 or R2 (not Postgres blobs)

**Status:** Superseded for v2 local core by ADR-021 (local vault). Remains valid if/when a remote blob backend is needed.  
**Context:** 100+ GB PDFs.  
**Decision:** S3-compatible object storage; Postgres stores keys only.  
**Default pick:** Backblaze B2 for cost; R2 if egress-heavy.

---

## ADR-008: Meilisearch for corpus search

**Status:** Accepted  
**Context:** 1500+ markdown files, agent search, typo tolerance.  
**Decision:** Meilisearch behind API proxy.  
**Alternatives rejected:** Postgres FTS only (weaker UX), client-side scan (too heavy).

---

## ADR-009: Hono + ts-rest + OpenAPI for external API

**Status:** Accepted  
**Context:** Portals and AI agents need stable REST + generated clients.  
**Decision:** Custom OpenAPI service alongside PowerSync.  
**Alternatives rejected:** tRPC primary (poor external interop), Convex HTTP only.

---

## ADR-010: Sync tiers A/B/C/D

**Status:** Accepted  
**Context:** Large PDF library must not sync to phones.  
**Decision:** Enforce tiers in PowerSync rules and API design.  
**See:** [03-data-model.md](03-data-model.md)

---

## ADR-011: Reject Convex as primary backend

**Status:** Accepted  
**Context:** User considered Convex for reduced backend burden.  
**Decision:** Not primary — weak offline mobile, document DB, portal friction.  
**Note:** Convex fine for unrelated greenfield web-realtime apps.

---

## ADR-012: Reject Supabase-as-everything (for now)

**Status:** Deferred  
**Context:** Supabase + PowerSync is viable fewer-vendor stack.  
**Decision:** Prefer custom Hono API for OpenAPI control; Supabase Postgres as host option OK.  
**Revisit:** If ops burden too high in Phase 1.

---

## ADR-013: Live document sync Level 2 (not CRDT v1)

**Status:** Accepted  
**Context:** Human + agent on same markdown file.  
**Decision:** Version + SSE subscribe + PATCH; not Yjs/CRDT in v1.

---

## ADR-014: Markdown docs for agent planning

**Status:** Accepted  
**Context:** User asked if markdown is best for agent-readable specs.  
**Decision:** Markdown + `AGENTS.md` + `docs/llms.txt` index (Expo/llms.txt pattern).  
**Alternatives:** Notion export (worse for git), single JSON (harder to edit), specialized tools — unnecessary for git-based agent workflow.

---

## ADR-015: Separate product app and ops admin

**Status:** Accepted  
**Context:** User wants `backsteros.com/app` for tasks/content and `backsteros.com/admin` for logs/sync/API observability — not mixed in one SPA.  
**Decision:** `backsteros-app/` (product) and `backsteros-admin/` (ops); cross-link in nav; shared auth and `api-client`.  
**Consequences:** Separate app and admin deployments; admin Phase 3b after API exposes metrics. The product app deployment and hostname are governed by ADR-018.

---

## ADR-016: Clerk auth + local Docker Postgres

**Status:** Superseded (Neon / cloud Postgres retired — local-only v2)  
**Context:** Phase 1 needed human auth and a Postgres host. Neon was briefly used for early cloud experiments.  
**Decision (current):**
- **Auth:** Clerk for human sessions on desktop / mobile
- **Postgres:** Docker Compose locally (`localhost:5433`) only — no Neon or other cloud Postgres for active work
- **Agent API keys:** Custom `sk_live_…` in Postgres — not Clerk

**Historical:** Neon Free + droplet Kamal were evaluated and later removed from the deploy surface.

---

## ADR-017: API host (local core)

**Status:** Superseded (`service.backsteros.com` cloud API retired)  
**Context:** Early hosting used `service.backsteros.com` because `api.backsteros.com` was unavailable.  
**Decision (current):** API, sync upload, and OpenAPI live on the **local computer** (`http://127.0.0.1:8788`, or Tailscale MagicDNS to that host).  
**Consequences:** Clients and agents target local core; no public cloud API is required for v2.

---

## ADR-018: Standalone Next.js product web app

**Status:** Accepted (hostname amended)
**Context:** The product shell needs first-class web routing, Clerk middleware,
responsive behavior, and deployment independent from marketing and admin. Circle
already provides a proven Next.js shell and interaction model. An earlier draft
used a separate `app.backsteros.com` host without a base path; product URLs are
aligned with ADR-015 (`backsteros.com/app`).

**Decision:**
- Build `backsteros-app` with Next.js 16, React 19, and Tailwind CSS 4.
- Deploy it as a standalone web service at **`https://backsteros.com/app`**.
- Set Next.js `basePath` to `/app` in production (`NEXT_PUBLIC_BASE_PATH=/app`).
  In-app routes stay root-relative (`/projects`, `/tasks`, `/knowledge`); Next
  prefixes them under `/app`. Local `next dev` may omit the base path.
- Canonical URL: `NEXT_PUBLIC_APP_URL=https://backsteros.com/app`.
- Use Clerk's Next.js middleware and sign-in route for human authentication
  (Clerk origins use apex `https://backsteros.com`).
- Keep it responsive web only. Desktop and mobile native clients are separate
  decisions and do not load this Next.js build.
- Keep backend logic, storage, sync services, SQLite, and API routes out of the
  product app, except deployment-facing web endpoints such as `/api/health`
  (publicly `GET /app/api/health`).

**Supersedes:** ADR-006, and the product-host/path portions of ADR-015 and
ADR-017. Supersedes the earlier `app.backsteros.com` host choice in a prior
revision of this ADR. Desktop packaging is governed by ADR-019 (not this ADR).

---

## ADR-019: Desktop = Tauri 2 + Vite/React (near-identical product UI)

**Status:** Accepted  
**Context:** Web product (`backsteros-app`) is Next.js at `backsteros.com/app`
(ADR-018). Desktop must feel native, lightweight on M1, and offline-capable
without Circle’s Tauri + Next Node sidecar. The product UX on desktop should be
**very close or identical** to the web app users already use. Mobile remains a
separate Expo client (ADR-004) — not the same framework as desktop.

**Decision:**
- Build **`backsteros-desktop/`** as **Tauri 2** loading a **Vite + React** SPA
  (static frontend only).
- **Do not** embed, package, or run the Next.js server / standalone build inside
  Tauri. Talk to **local core** (`http://127.0.0.1:8788` or Tailscale) for API,
  sync upload, and content fetch.
- **Do not** use Expo or React Native for desktop; do not use Tauri for iOS.
- Product UI and interaction model should match **`backsteros-app`** as closely
  as practical (same screens, patterns, keyboard flows). Prefer extracting shared
  React UI / helpers into `backsteros-packages/` (or deliberate ports from the
  Next app) so web and desktop stay aligned — without coupling desktop to Next
  middleware, RSC, or App Router Route Handlers.
- **Desktop-first shared UI:** Stabilize `@backsteros/ui` detail/layout views in
  `backsteros-desktop` first. Do not migrate Next onto those shared views until
  desktop polish is solid — web keeps local screen trees in the meantime.
- Auth: Clerk in SPA / Tauri mode (not Next middleware). Same Clerk application
  as web where possible; configure allowed origins for the Tauri / Vite dev hosts.
- Offline: PowerSync **web** SDK + partial sync rules (metadata first; Tier D
  bodies/PDFs on demand). Same performance rules as [07-performance.md](07-performance.md).
- Optional: menu items open `https://backsteros.com/app` or `/admin` in the
  system browser — ops admin is not embedded in the desktop shell v1.

**Alternatives rejected:**
- Second Next.js app or Next sidecar in Tauri (heavy; repeats Circle)
- WebView that only loads `https://backsteros.com/app` as the long-term product
  (weak offline; fights thin-client + PowerSync desktop goals)
- One framework for desktop + mobile (Expo everywhere or Tauri on iOS)

**Consequences:** Three product clients — Next web, Tauri+Vite desktop, Expo
mobile — sharing `contracts` / `api-client` / `powersync-schema`. Shared UI
(`@backsteros/ui`) is **desktop-first** until polish lands; Next keeps local
screens until then. Phase 5 desktop work scaffolds `backsteros-desktop`, not a
fork of the Next deployment pipeline.

**Supersedes:** ADR-005.

---

| ID | Question | Owner |
| --- | --- | --- |
| Q-001 | Domains: product + API host | **Resolved (v2):** local core `127.0.0.1:8788` (+ Tailscale); no cloud API |
| Q-002 | B2 vs R2 after measuring PDF egress | Deferred — v2 uses local vault (ADR-021) |
| Q-003 | Clerk vs Supabase Auth | **Resolved:** Clerk |
| Q-004 | Monorepo vs multi-repo | **Resolved:** single workspace `~/code/backsteros/` with subfolders |
| Q-005 | Self-host PowerSync vs PowerSync Cloud | **Resolved (v2):** self-host Docker PowerSync locally |
| Q-006 | Postgres host | **Resolved (v2):** Docker only — Neon / cloud Postgres retired |
| Q-007 | Desktop client stack | **Resolved:** Tauri 2 + Vite/React (ADR-019); UI near-identical to web |

---

## ADR-020: v2 local-computer core + Expo/Tauri shells

**Status:** Accepted  
**Context:** v1 spread product UI across Next web, Expo, Tauri, admin, and a development console. Day-to-day BacksterOS should run on a **local computer** with Apple shells only (for now), without a shared visual UI between phone and desktop.  
**Decision:**

- **Core** on a **local computer**: `core/server` + Postgres + files + PowerSync
- **Shells:** `mobile/` (Expo, iPhone + iPad adaptive) and `desktop/` (Tauri + React)
- **Shared packages** under `core/packages/` (contracts, api-client, powersync-schema only)
- **No shared UI** between mobile and desktop; desktop-owned UI may live under `desktop/packages/ui/`
- **Archive** v1 apps into `legacy/` (Next app/admin/development, sync-demo) — reference only
- **Naming:** use “local computer” in docs — not a specific hardware model

**Consequences:** Cleaner root (`core`, `mobile`, `desktop`, `legacy`). Client hosting portals / Next product web are out of active v2 scope. Package `@backsteros/api` renamed to `@backsteros/server`.

---

## ADR-021: Local Obsidian-style vault (not DigitalOcean Spaces)

**Status:** Accepted  
**Context:** v2 core runs on a local computer; Spaces credentials and cloud bucket layout no longer fit day-to-day ops.  
**Decision:**

- Store markdown and letter PDFs under a **local vault root** (`BACKSTEROS_VAULT_PATH` or Settings → Storage)
- Auto-create `Journal/`, `Projects/{KEY}/{Codebase,Documents,Updates}/`, `Letters/YYYY/MM/`, `Knowledge Base/`
- Keep Postgres metadata + `storage_key`; clients use API/PowerSync (no bulk Tier C/D sync)
- Avatars and other system blobs under `.backsteros/`

**Supersedes for v2:** ADR-007 cloud-first default. Remote B2/R2 remains an optional future backend.

---

## ADR-022: Tailscale-trusted agent TUI on iPad

**Status:** Accepted  
**Context:** Desktop codebase tasks show stacked detail + a local Cursor agent PTY. iPad should mirror that layout; the agent binary and working directory live on the local computer.  
**Decision:**

- Keep PTY ownership on the laptop sidecar (`pnpm pty`); do **not** store PTY process ids in core
- Core brokers `GET /api/v1/agent-pty/connection` (`AGENT_PTY_PUBLIC_URL` + `AGENT_PTY_AUTH_TOKEN`)
- Sidecar may bind beyond loopback with `PTY_HOST` + required `PTY_AUTH_TOKEN` for Tailscale shells
- iPad codebase task layout: stacked detail | **native WebSocket** + **Ghostty Metal** (`expo-libghostty`) over Tailscale (create / attach / resume)
- Standard iPad tasks keep content + properties rail; **iPhone agent TUI deferred**
- No shared visual UI with desktop — mobile owns its terminal surface

**Consequences:** Laptop must run core + `pnpm pty` on the tailnet. Public internet PTY exposure remains a non-goal.

---

## ADR-023: Herdr for shared agent TTY (desktop + iPad)

**Status:** Superseded by ADR-025 (agent path)  
**Context:** Custom multi-viewer fan-out on raw `node-pty` could not keep desktop and iPad on one live Cursor Agent conversation. tmux would share a TTY but not agent state.  
**Decision:**

- Keep BacksterOS xterm / Ghostty UIs + Tailscale `pnpm pty` sidecar
- Durable session = **one Herdr agent pane per task** (`herdr agent start backsteros-<taskId> …`)
- Placement: Herdr **workspace** labeled with the project name; **tab** labeled with the task display id (e.g. `LD-2`) — not splits in General
- Viewers attach with **one shared** `herdr agent attach` in the PTY sidecar (fan-out to desktop + iPad WebSockets). Herdr attach is exclusive — a second CLI attach kicks the first off
- Start uses `POST /agent/ensure`
- Bridge Herdr `agent_status` (working / blocked / idle / done) into BacksterOS activity indicators
- Core still syncs only `agentChatId` — not Herdr pane ids
- Invoke Herdr as an **unmodified external binary** (AGPL-3.0); do not vendor/fork into the repo. Revisit commercial licensing if BacksterOS ever wraps Herdr as a hosted multi-tenant product.

**Alternatives rejected:** tmux-only multiplexer; custom byte fan-out; embedding the full Herdr TUI in-app.

**Consequences:** Laptop needs Herdr + `herdr integration install cursor`. Agent sessions require Herdr; shell PTYs remain plain `node-pty`. **Superseded by ADR-025** for agent Chat.

---

## ADR-024: Chat via Cursor ACP; Terminal via Herdr

**Status:** Superseded by ADR-025  
**Context:** Driving the Cursor Agent TUI with PTY/Herdr keystrokes (`agent send` + Enter) is brittle — Cursor CLI has known paste/Enter chunk bugs, and Chat history was not a first-class protocol. T3 Code’s reliable pattern is a structured agent protocol (ACP) under a React chat UI — not hybrid Chat→Herdr typing.  
**Decision:**

- **Chat tab = ACP only** (T3-style): text prompts, streaming, mode, and cancel go through Cursor ACP (`session/prompt`, `session/update`, `session/set_mode` / config mode, `session/cancel`) via `POST /agent/prompt`, `/agent/acp/mode`, `/agent/acp/cancel`
- Chat **never** injects prompts or mode slashes into the Herdr TUI (`herdrSubmitAgentPrompt` / `herdrSwitchAgentMode` are not on the Chat path)
- Mode chip maps UI `build` → ACP `agent`; Ask / Plan / Debug use ACP `set_mode`. Failures surface in Chat (chip rolls back) — no Herdr `/debug` fake
- Live Chat turn chrome is driven by `acp-event` `session-update` / `prompt-complete`; Cursor hooks remain **optional enrichment** for Terminal-originated activity
- Sidecar-started Herdr agents still get `BACKSTEROS_AGENT_*` hook env for Terminal/status; agents missing that env are replaced once so hooks work after `pnpm pty` restart
- Herdr `blocked` → Chat/status **attention** (“needs input in Terminal”); ACP still owns in-Chat permission / ask-question UI when the turn is ACP-driven
- The sidecar **symlinks** `~/.cursor/chats/<md5(cwd)>/<id>` → the ACP store so Terminal `agent --resume <id>` can **view** the same conversation
- **Terminal tab** attaches to Herdr running `agent --resume <id>` as a **viewer** of the shared session; typing in Terminal is optional and not required for Chat
- Tool `session/request_permission` is auto-approved (`allow-once` / `allow-always`) for personal-ops reliability; richer permission UI can come later

**Alternatives rejected:** Hybrid Chat text via Herdr + ACP fallback (previous ADR-024); polish PTY chat injection only; adopt T3/Codex stack wholesale; drop Terminal/Herdr entirely; dual-run ACP + Herdr prompts on every Chat send.

**Consequences:** Prefer Chat for sends — ACP is the agent. **Superseded by ADR-025** (Herdr removed from agent path).

---

## ADR-025: Agent Chat = Cursor ACP + server projection (no Herdr)

**Status:** Accepted (2026-07)  
**Supersedes:** ADR-023 (agent path), ADR-024 Terminal/Herdr half  
**Context:** Herdr shared-TTY made Chat leave/return unreliable. Streaming timelines were UI-owned and filtered to the selected task, so background conversations did not project like T3 Code. T3’s solid model is: durable threads + live provider sessions + server-side runtime ingestion; the UI is a disposable viewer.

**Decision:**

- **Agent Chat is ACP-only** (Cursor `agent acp`): ensure / prompt / mode / cancel / permissions
- **Server projects** ACP `session/update` into `~/.backsteros/agent-chat-transcripts/<chatId>.json` while the turn runs — independent of which task is focused
- **Chat event bus** fans `acp-event` frames to WebSocket subscribers by `taskId`; closing the socket does not stop ACP
- **No Herdr** for agent sessions: remove Herdr ensure/attach/poll from the agent path
- **Reference checkout:** `tmp/t3-code` (gitignored) — prefer matching ProviderService / RuntimeIngestion patterns when fixing agent Chat
- Shell `node-pty` remains for non-agent terminals if needed later

**Alternatives rejected:** Keep Herdr as Terminal viewer alongside ACP; hybrid Chat→Herdr typing; full Effect/orchestration port of T3.

**Consequences:** Restart `pnpm pty` after sidecar changes. External `agent --resume <chatId>` may still work via ACP↔CLI session link, but is not required for Chat. iPad shared live TUI via Herdr is retired; iPad should use ACP Chat + transcript sync.

---

## ADR-026: Finance — bank-first CSV import, Tier A/C split

**Status:** Accepted (2026-08)  
**Context:** Large bank CSV histories (ING / AMEX) need a first-class Finance surface without PowerSync-bootstrapping tens of thousands of ledger rows.  
**Decision:**

- Create **bank accounts** first; upload CSV into a specific account
- **Bank accounts + categories = Tier A** (PowerSync); **transactions = Tier C** (paginated REST only)
- Ledger fields append-only / no client delete; classification (`organizationId`, `projectId`, `categoryId`, `notes`) is mutable + batchable
- Built-in dialects only for v1: **ING NL** (`;`, `YYYYMMDD`, Debit/Credit) and **AMEX NL** (`,`, `MM/DD/YYYY`, signed `Bedrag`, unique `Referentie`)
- Dedup: AMEX `externalId`; ING fingerprint hash; idempotent re-import
- Desktop-first: month → week grouping, search/filters, org suggestions, bulk classification

**Consequences:** Charts/budgets/rules deferred. Mobile Finance deferred. No generic column mapper in v1.

---

## ADR-027: Moneybird — personal API token for Finance invoices

**Status:** Accepted (2026-08)  
**Context:** Finance needs access to Moneybird sales invoices. Community SDKs are incomplete; Apideck adds a third-party proxy. Moneybird documents personal API tokens and OAuth; BacksterOS is a personal local-computer host.  
**Decision:**

- Use a **thin first-party Moneybird REST client** in `core/server` (Bearer token, API v2)
- Store **API token + administration id** in `workspace_integration_secrets` (same pattern as Cursor; not PowerSync)
- Settings → Integrations → **Moneybird**: save token, pick administration, test connection
- Finance → **Invoices** lists sales invoices live via `GET /api/v1/finance/moneybird/invoices` (no local invoice table yet)
- Prefer personal API token with `sales_invoices` scope for v1; OAuth deferred

**Alternatives rejected:** Apideck accounting SDK; `@print-one/moneybird-js` as hard dependency; OAuth-only flow for v1.

**Consequences:** Invoice sync/cache into Postgres can come later. Purchase invoices / bank mutations are out of scope until scopes expand.

---

## ADR-028: Finance — transfer/excluded categories omit from cashflow

**Status:** Accepted (2026-08)  
**Context:** Credit-card payoffs appear as a bank debit plus a card payment credit. Treating both as normal income/expense double-counts spend (and inflates income) even though account balances and assets/debt stay correct.  
**Decision:**

- A transaction is **non-cashflow** when its live category has `kind === "transfer"` **or** `listing === "excluded"`
- Income / expense / net / spend-panel / category cashflow breakdowns **omit** those rows
- Account **balances** and **assets/debt** still sum every ledger row
- Uncategorized rows still count as cashflow
- Matched transfer pairs (auto-link bank ↔ card) are **deferred**; users classify payoff legs into a Transfer/Excluded category (e.g. “Creditcard payments”)

**Consequences:** Dashboard and Cash flow become trustworthy after payoff classification. Creating an excluded category alone is not enough without this aggregate rule (and vice versa: the rule needs tagged rows).

---

## ADR-029: Finance — credit-card cashflow polarity on import

**Status:** Accepted (2026-08)  
**Context:** AMEX NL (and similar issuer CSVs) use liability polarity: purchases are positive, payments/refunds are negative. Bank CSVs use cashflow polarity. Mixing them made card spend look like income and card balances look like assets.  
**Decision:**

- When importing into an account with `type === "credit_card"`, negate `amountCents` (and `balanceAfterCents` when present) before insert
- Parser fingerprints stay on **source** polarity so re-imports still dedupe
- One-time SQL migration flips existing credit-card rows (idempotent guards on thank-you payment sign / aggregate balance)
- Transfer/excluded categorization of bank↔card payoffs (ADR-028) remains required for the checking-account leg

**Consequences:** Credit-card purchases count as expenses; payments count as credits that reduce debt; assets/debt charts treat negative card balances as debt.

---

## ADR-030: Finance — category totals net credits against debits

**Status:** Accepted (2026-08)  
**Context:** Shared expenses (e.g. restaurant bill) often have a matching credit when someone pays you back. Showing only gross debits per category made “true spend” (what you actually paid) impossible to read; all-white totals also hid debit vs credit.  
**Decision:**

- Per-category totals use **net-spend polarity**: `sum(-amountCents)` — positive = net outflow, negative = net inflow
- Credits tagged to the same category **reduce** that category’s spend (dinner −€100 + repayment +€40 → €60 Restaurant spend)
- Dashboard Top categories, Categories Spent column / detail hero, spend-panel category list, and cashflow category month stacks follow this rule
- Overall income / expense / net cashflow stay **sign-separated** (not netted into a single bucket); transfer/excluded categories still omit from cashflow (ADR-028)
- UI shows the absolute amount with **debit (red) / credit (green)** coloring (dashboard Top categories, Categories page, spend panel) so net spend vs net income is readable at a glance.

**Consequences:** Category analysis reflects true cost when reimbursements share a category. Users should tag shared-expense repayments on the same category as the original spend. Gross monthly spend headlines (total money out) remain debit-only where that metric is intentional.

---

## ADR-031: CRM Phase 1 — contacts/orgs foundation

**Status:** Accepted (2026-08)  
**Context:** BacksterOS needs Clay/Dex-style personal CRM basics (birthdays, relationships, groups, activity feed) without social OAuth, enrichment, or reach-out automation.  
**Decision:**

- **Birthday:** nullable `contacts.birthday` as full `YYYY-MM-DD` (year required). Yearless birthdays deferred. Calendar shows **virtual** yearly all-day markers derived from the field — not meetings.
- **Relationships:** directed `contact_relationships` edges; UI lists both directions with inverse labels (no duplicate edges). Separate from `GET /contacts/:id/relations` (org/tasks/letters).
- **Groups:** `crm_groups` + polymorphic `crm_group_members` (`contact` | `organization`). Desktop manage/chips on detail; group merged feed deferred (TODO).
- **Activity:** `crm_activities` with `note` (body capped ≤8KB, Tier A) and `meeting` (materialized pointers synced on meeting write/delete). Feed APIs paginate reverse-chronologically; desktop Activity tabs use REST.
- **Scopes:** reuse `contacts:*` / `organizations:*`. Desktop-first; mobile parity TODO.
- **Out of scope:** social connectors, Clay enrichment, auto reach-out tasks.

**Consequences:** Re-run `db:migrate` + `db:powersync-setup` after deploy. Meeting feed rows stay in sync via meeting domain writes.

---

## ADR-032: Contact first + last name

**Status:** Accepted (2026-08)  
**Context:** A single `contacts.name` field blocks last-name-only search and a proper given/family identity header.  
**Decision:**

- Add `first_name` (required) and `last_name` (required, default `''`).
- Migrate existing `name` → `first_name`; keep `name` as the derived display string `trim(first + ' ' + last)` updated on write.
- API create/update accept `firstName` / `lastName` (legacy `name` alone still maps to firstName).
- Search matches `name`, `first_name`, `last_name`, and `email`.

**Consequences:** Clients should edit first/last separately; list labels continue to use display `name`. Re-run migrate + PowerSync setup so Tier A sync includes the new columns.

---

## ADR-033: Contact additional email addresses

**Status:** Accepted (2026-08)  
**Context:** Matching inbound/outbound mail to a contact fails when people use aliases or secondary addresses beyond a single primary `contacts.email`.  
**Decision:**

- Keep `contacts.email` as the primary address.
- Store additional addresses in `contacts.emails` (`jsonb` array of `{ label, address }`, labels `personal` | `work` | `other`, max 20). Column already migrated in `0071_contact_emails.sql` (legacy string entries coerced on read/write).
- Normalize on write (trim, dedupe case-insensitively, drop aliases that match primary). Shared helpers live in `@backsteros/contracts` (`getContactEmailAddresses`, `contactMatchesEmailAddress`, …).
- Desktop contact overview edits primary + additional rows with a label dropdown; email UI search/match uses the full address set.
- The primary address also stores its Personal/Work/Other label inside `emails` (same address as `email`); clients render one unified list with index 0 as primary.

**Consequences:** Re-deploy PowerSync sync-config so clients receive `emails`. Email linking should prefer any matching address, not only primary.

---

## ADR-034: Mapbox — access token for geocode + contact maps

**Status:** Accepted (2026-08)  
**Context:** Contact (and future meeting) locations are free-text address fields with no validation or map. We want autocomplete-quality geocoding later and a map pin now, without putting third-party secrets in PowerSync.  
**Decision:**

- Store the Mapbox access token in `workspace_integration_secrets.mapbox_access_token` (same pattern as Moneybird / Cursor — ADR-027). Settings responses expose only `accessTokenConfigured` + masked preview.
- Thin server client (`mapbox-client.ts`) proxies Geocoding and Static Images; desktop never embeds the token for these calls.
- Persist `contacts.latitude` / `contacts.longitude` (Tier A / PowerSync) when Location details are saved and geocode succeeds; clear when address fields are emptied. Static map PNG is fetched on demand via `GET /api/v1/mapbox/static-map`.
- Settings → Integrations → Mapbox for token save/test. Address autocomplete and meeting locations are deferred; reuse the geocode/place contracts when added.

**Consequences:** Re-run migrate + PowerSync setup so clients receive lat/lng. Prefer a URL-restricted `pk.` token or a server `sk.` token; both work server-side.

---

