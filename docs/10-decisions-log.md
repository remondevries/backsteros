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

**Status:** Accepted  
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

## ADR-016: Clerk auth + Neon Postgres

**Status:** Accepted  
**Context:** Phase 1 needs human auth and a production Postgres host. DO Managed Postgres (~$15/mo) works but PowerSync (Phase 3) integrates more cleanly with Neon; Clerk free tier fits single-owner use.  
**Decision:**
- **Auth:** Clerk (Hobby / free) for human sessions on `/app`, `/admin`, mobile
- **Postgres prod:** [Neon](https://neon.tech) — Free tier to start; Launch plan if always-on needed
- **Postgres dev:** Docker Compose locally (`localhost`) — not Neon for day-to-day coding
- **Agent API keys:** Custom `sk_live_…` in Postgres — not Clerk

**Neon setup notes (Phase 3):** Enable logical replication in Neon console; create `powersync_role` + `powersync` publication per [PowerSync Neon guide](https://docs.powersync.com/integrations/neon).

**Alternatives rejected:** DO Managed Postgres (higher cost, `aiven_extras` for PowerSync), Supabase Auth (Clerk chosen), Supabase Postgres-only (unnecessary bundle).

---

## ADR-017: API host `service.backsteros.com`

**Status:** Accepted  
**Context:** `api.backsteros.com` subdomain already in use elsewhere.  
**Decision:** API, sync, and OpenAPI live at **`https://service.backsteros.com`**. The product app hostname is superseded by ADR-018.
**Consequences:** REST base URL is `https://service.backsteros.com/api/v1`; clients and agents use this host.

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
  Tauri. Remote **`https://service.backsteros.com`** only for API, sync upload,
  and content fetch.
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
| Q-001 | Domains: product + API host | **Resolved:** product `backsteros.com/app`, API `service.backsteros.com` (`api.` unavailable) |
| Q-002 | B2 vs R2 after measuring PDF egress | Phase 2 |
| Q-003 | Clerk vs Supabase Auth | **Resolved:** Clerk |
| Q-004 | Monorepo vs multi-repo | **Resolved:** single workspace `~/code/backsteros/` with subfolders |
| Q-005 | Self-host PowerSync vs PowerSync Cloud | Phase 3 |
| Q-006 | Postgres host (prod) | **Resolved:** Neon (dev: Docker) |
| Q-007 | Desktop client stack | **Resolved:** Tauri 2 + Vite/React (ADR-019); UI near-identical to web |
