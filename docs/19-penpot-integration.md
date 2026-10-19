# 19 · BacksterDESIGN — Penpot fork and BacksterOS integration

**Status:** Design agreed (13 Oct 2026 call); mapping revised (14 Oct 2026). Standalone spec. Partial implementation: fork, local devenv, BacksterOS projects dashboard tab, and (in progress) project link + create-or-open for staff.
**Related:** [ADR-035](10-decisions-log.md) (cloud-core center, private R2), [06-storage-and-search.md](06-storage-and-search.md), [16-linear-shaped-sync.md](16-linear-shaped-sync.md), [03-data-model.md](03-data-model.md), `backsterdesign/BACKSTER.md`, `backsterdesign/deploy/README.md`. Repo folder layout: [20-repo-structure.md](20-repo-structure.md).

BacksterDESIGN is the design workspace for BacksterOS: a **forked Penpot** under `backsterdesign/`, parallel to BacksterDEV under `backsterdev/`. This doc is the single reference for it. §1 covers the fork and the local dev environment. §2–§8 are the integration spec: identity, MCP/API/webhooks, the design→code loop, storage, branding, task linking and UI, and deploy. §9 lists the open gaps.

| Product | Folder | Local start |
| --- | --- | --- |
| BacksterOS | repo root (`core/`, `backsteros/`, …) | `pnpm --filter @backsteros/desktop dev` |
| BacksterDEV | `backsterdev/` | `pnpm --filter @backsteros/development dev` |
| BacksterDESIGN | `backsterdesign/` | `pnpm --filter @backsteros/design dev` |
| BacksterDESIGN desktop | `backsterdesign/desktop/` | `pnpm --filter @backsteros/design-desktop tauri:dev` (needs Penpot URI) |

## 1. Fork and dev environment

### Why a fork

Penpot plugins cover canvas tooling, but not first-class product chrome or deep BacksterOS integration. Upstream also lacks **per-project member visibility** (roles are team-wide only; see [penpot#8860](https://github.com/penpot/penpot/issues/8860)), and has no reliable content-change events (§3).

Forking lets us own UI, permissions, and OS bridges over time. The fork is pinned to Penpot **2.18.3** and **periodically rebased onto upstream**.

### Layout

```text
backsterdesign/                    ← vendored Penpot (pinned) + Backster overlays
├── frontend/ backend/ …      upstream tree
├── desktop/                  Tauri 2 shell (@backsteros/design-desktop) (§8)
├── mcp/                      vendored official Penpot MCP server (§3)
├── branding/                 BacksterDESIGN assets + apply scripts (temporary, §6)
├── deploy/                   self-host / compose notes (remote instance)
├── scripts/backster-dev.sh   local devenv wrapper
├── manage.sh                 upstream Penpot devenv manager
└── BACKSTER.md               short entry
```

Root filter shim: `pnpm --filter @backsteros/design …` → `tooling/design/`.
Desktop: `pnpm --filter @backsteros/design-desktop tauri:dev` (or `pnpm --filter @backsteros/design desktop`).

### Local development

Requires **Docker** and **Bash 4+** (`brew install bash` on macOS — system `/bin/bash` is 3.2 and cannot run Penpot’s `manage.sh`). First start pulls `penpotapp/devenv` plus infra images (large).

```bash
# from BacksterOS repo root
pnpm --filter @backsteros/design dev          # pull image if needed + start devenv
pnpm --filter @backsteros/design dev:status   # running? URL?
pnpm --filter @backsteros/design dev:attach   # tmux inside the container
pnpm --filter @backsteros/design dev:logs
pnpm --filter @backsteros/design dev:down     # stop
```

| | |
| --- | --- |
| App | https://localhost:3449 (also http://localhost:3450) |
| Source bind | `backsterdesign/` → `/home/penpot/penpot` in the devenv container |
| Pin | Penpot **2.18.3** (see `backsterdesign/BACKSTER.md`) |
| BacksterOS bridge | `window.backsterosCore.baseUrl` = `/backsteros-core` (same-origin nginx → host `127.0.0.1:8788`). Direct `http://127.0.0.1:8788` fails as mixed content under HTTPS. Requires local-core running; `apiKey: "local"` for local-shell. |

This is Penpot’s official **devenv** (compile frontend/backend inside Docker). It is the correct way to develop on the fork — same idea as running BacksterDEV’s nested app, with a heavier toolchain.

Also useful:

```bash
pnpm --filter @backsteros/design penpot:status   # tree / branding checklist
pnpm --filter @backsteros/design branding:apply  # overlay onto a running *stock* frontend container (temporary, §6)
```

### Direction

1. Vendor & pin Penpot in `backsterdesign/` (done).
2. Local devenv as the default edit/run loop (done).
3. Develop the local fork first, then promote the fork to **lemodesign** later (§8). `development` is a design runtime, not a build host — images are not built there.
4. Land features in source (client chrome lock-down, BacksterOS panels, native branding, content-change stream); drop temporary CSS/JS injects as they are replaced.

### Non-goals (for now)

- Replacing Penpot’s canvas engine.
- Publishing a public SaaS fork.
- Building a full Penpot project-ACL UI on day one (see §7 — portal allowlist + client redirect instead).

## 2. Access and identity

- **BacksterOS is the only identity.** Users never see a Penpot login screen. BacksterOS signs them in to Penpot.
- **Per-contact Penpot token.** Each contact that uses design (staff or client) gets a Penpot access token. It is stored **encrypted** on the contact record, server-side only, using the same pattern as other integration secrets (`workspace_integration_secrets`, ADR-037). It never goes into PowerSync or client SQLite.
- **Opt-in toggle** per contact. If it is off, no Penpot account is created and no token is stored. Portal access that includes design also provisions the Penpot user/token.
- **Agents use a service user, not their API key.** A BacksterOS `sk_live_` bearer key **cannot** sign in to Penpot. Penpot has its own auth (session cookie or Penpot access token). So each agent gets a **dedicated Penpot service user**, mapped to that agent's BacksterOS contact. Its Penpot token is stored encrypted on the agent contact, the same as for humans. Penpot activity then shows up under the agent contact that did it.

### Staff vs clients in Penpot

| Audience | Penpot team(s) | How they use Penpot |
| --- | --- | --- |
| **Lemo-Design staff** | Team `Lemo-Design` (and client teams if needed) | Full BacksterDESIGN dashboard. BacksterOS projects list mirrors core; click create-or-opens the linked Penpot project. |
| **Clients** | Shared team `Clients` (or equivalent flag) | **No Penpot home/dashboard.** Portal is the only map. Deep-link opens one allowed file; leaving that context hard-redirects to the portal. |

**Client chrome lock-down (fork):** any client-team (or client-flagged) user who hits a non-file route is hard-redirected to the client portal.

**Client open allowlist (required with the above):** on file open (`get-file` / workspace entry), Penpot checks BacksterOS: may this contact access the linked project/file? If not → not-found / redirect to portal. UI redirect alone is not authorization — Client A must not open Client B’s file by UUID.

BacksterOS remains the source of truth for which projects a contact may see (org linkage today; finer per-contact grants can hook the same allowlist later), same idea as [portal visibility](13-hybrid-cloud-local-core.md).

## 3. MCP, API and webhooks

### MCP

- **Pin the official Penpot MCP server** (`@penpot/mcp`, source vendored at `backsterdesign/mcp/`). It has been on npm for about two months and is still **beta**. Pin the version that matches the fork's Penpot pin (2.18.3), and bump them together.
- Community REST-based MCP servers are **redundant** with it. Do not add them.
- **It runs in the editor tab, through the Plugin API.** The MCP server talks over WebSocket to the Penpot MCP Plugin running inside an open editor tab, and the agent's code runs there. **There is no headless path.** A design file must be open in a browser or webview for an agent to act on it.
- **Design tokens** are read and written as **W3C DTCG JSON**.

### Self-hosting MCP

- Turn it on with the `enable-mcp` flag in `PENPOT_FLAGS`.
- Run either the `penpotapp/mcp` container or local `npx @penpot/mcp`, pointed at **our own instance URL**.
- The editor builds its MCP endpoints from the instance's **public domain**. Nothing hardcodes `design.penpot.app`.
- The reverse proxy must route **`/mcp/stream`** and **`/mcp/ws`**, with **WebSocket upgrade** on `/mcp/ws`. Upstream's template is `backsterdesign/docker/images/files/nginx-mcp-locations.conf.template`. It also has `/mcp/sse`.
- The **remote, hosted-style mode** offers fewer tools than local `npx`. Use local `npx` for agent sessions that need the full toolset.
- **Fork risk:** self-hosting the fork is low risk. The real risk is **breaking the plugin runtime** with fork changes, because MCP depends on it completely. Treat the Plugin API as a contract and run the MCP and plugin e2e (`backsterdesign/plugins/apps/e2e/`) after every rebase or feature landing.

### Webhooks and the content-change stream

- Upstream Penpot has **team-level webhooks**, but **nothing reliable fires on actual design edits**. They cannot drive "this file/page/element changed" in BacksterOS.
- **The BacksterDESIGN fork adds a content-change event stream:** file/page/element-level change events that BacksterOS consumes, for example to update linked tasks and their activity. This is a fork feature, not an upstream setting.
- Penpot's REST/RPC API with access tokens covers the rest: provisioning users and teams, listing files, exports.

## 4. Design → code workflow

The loop, with the **BacksterOS task as the thread** for every step:

1. **Agent scaffolds code → Penpot.** It builds a first version of the screen or component in Penpot from code or a spec.
2. **Human polishes in Penpot.**
3. **Agent turns it into code and commits directly** to `production`, following the AGENTS.md git workflow (no PRs, no branches). The task gets the commit (`addLinkedCommitShas`) and comments at each step.

What agents do in Penpot:

- **Clean up**: reorganize messy designs, **name layers**, fix structure (boards, groups, components, flex/grid layout).
- **Not primary design.** Visual design decisions stay with the human.

**Design → code:** the agent maps **board components to the existing component library** (desktop: `backsteros/packages/ui/`). It reuses existing components and does not regenerate them. It emits **HTML/Tailwind** for anything with no existing component. Tokens come from the DTCG source (§5), not from hardcoded values.

## 5. Storage (R2) and the design-system portal

- **Penpot assets go to R2, not the `fs` Docker volume.** Upstream defaults to `PENPOT_OBJECTS_STORAGE_BACKEND: fs` (`/opt/data/assets`). Switch to `s3` with `PENPOT_OBJECTS_STORAGE_S3_ENDPOINT` set to the R2 endpoint, and a **private** bucket. This matches ADR-035: private R2 is the file store, and the public `ld-wp-media` bucket is not used. Penpot's Postgres keeps metadata only.
- **Design-system portal page:** a BacksterOS page that pulls the **DTCG tokens** from Penpot and renders the design system. It is shared with **both local-core and cloud-core**, so either core can serve it and code generation reads the same token source.
- Backups for the R2 bucket and for Penpot's Postgres are an **open gap** (§9). That work is tracked under OS-113.

## 6. Branding and theming

- **The real branding path is the BacksterDESIGN fork itself**, rebased periodically on upstream (§1). Branding lands as source changes in the fork.
- **Overlays are temporary.** Today `backsterdesign/branding/` holds assets and scripts, and `branding:apply` overlays them onto a running *stock* frontend container (this is how the shared instance on `development` is branded, §8). It is not the default mechanism. Overlays are folded into fork source over time, and the CSS/JS injects are dropped as they are replaced.
- On each rebase, check: the plugin runtime and MCP still work (§3), branding still applies, and file-format migrations are handled (open gap, §9).

## 7. Tasks, linking and UI

### Mapping

| BacksterOS | Penpot |
| --- | --- |
| Studio / workspace | Organization `Lemo-Design` |
| Staff workspace | Team `Lemo-Design` |
| Client accounts | Team `Clients` (shared; isolation via allowlist + redirect, §2) |
| Customer (organization) | Linkage on the BacksterOS project (`organizationId`) — not a Penpot team per customer |
| **Project** | **Project** (same name; linked by id) |
| Task / screen / deliverable | **File** (portal deep-links here) |
| Task design link (optional) | File, page, or element ID |

- Staff see a Penpot project tree that matches BacksterOS projects.
- Links are stored on the **BacksterOS** side (`projects.penpot_project_id`, and later file/page/element links on tasks). Nothing authoritative is stored only in Penpot.
- One customer → one Penpot team is **not** required for isolation under this model; keep that option if product needs change.

### Project link field

- Core column: `projects.penpot_project_id` (nullable text, Penpot project UUID).
- Exposed on the project API as `penpotProjectId`.
- Staff click on the BacksterOS projects tab: if linked → open that Penpot project’s files; if not → create a Penpot project under the current (staff) team with the BacksterOS name, PATCH `penpotProjectId`, then open it.

### UI

- **Dashboard (staff, local):** Penpot Projects chrome includes a **BacksterOS** tab listing core projects (`GET /api/v1/projects`). Config: `window.backsterosCore` in gitignored `frontend/resources/public/js/config.js` (seed from `frontend/config.js.example`; `baseUrl` + `apiKey`). CORS admits Penpot devenv origins (`isDesignDevenvOrigin`).
- **Clients:** no Penpot project browser. Client portal lists allowed work and opens a specific Penpot **file** URL; fork redirects any other Penpot navigation back to the portal.
- An **instrument-panel tab** in BacksterOS (in the design context) shows the **task list** for the open file/page/element, with **time tracking** (the existing `trackedMinutes` / time entries). You do not leave the design view to see or log work.

## 8. Deploy and runtime

| Environment | What |
| --- | --- |
| **Source of truth** | `backsterdesign/` in this monorepo. |
| **Local devenv** | `pnpm --filter @backsteros/design dev` → https://localhost:3449 — develop the fork here first (§1). |
| **Desktop (Tauri)** | `backsterdesign/desktop/` — package `@backsteros/design-desktop`. Overlay titlebar + tab strip; **one** Penpot SPA in an iframe (tabs route in-SPA, no remount). |
| **Shared instance (legacy)** | SSH host **`development`** — `/home/deploy/penpot`, stock images + branding overlay (§6). Freeze after cutover to lemodesign. |
| **Shared instance (canonical)** | SSH host **`lemodesign`** — `/home/deploy/backsterdesign`, fork images, public URL **https://design.lemo-design.com**. Build/deploy: `backsterdesign/deploy/README.md`. |

- **`development` is a design runtime, not a build host.** Agents may assume a server called "development" is where they build or run dev work. It only runs Penpot. No images are built there; don't build or run CI jobs there.
- **Tauri wrapper:** lives under `backsterdesign/desktop/` (`com.backsteros.design`), not under `backsteros/`. See `backsterdesign/desktop/README.md`.
- **Desktop + remote data (v1):** the shell is local; a **child webview** (not an iframe — Penpot sends `X-Frame-Options: SAMEORIGIN`) loads `PENPOT_PUBLIC_URI` (default `https://localhost:3449`) so auth cookies stay first-party on the Penpot origin. Network to that backend is required — there is no offline file sync.
- **Run desktop:**
  1. Start Penpot: `pnpm --filter @backsteros/design dev` (or point at a hosted instance).
  2. `pnpm --filter @backsteros/design-desktop tauri:dev`  
     Or via shim: `pnpm --filter @backsteros/design desktop`.  
     Optional: `PENPOT_PUBLIC_URI=https://your-host` / `VITE_PENPOT_PUBLIC_URI=…`.
- A **rename** of the `development` server to make its role clearer is listed as a consideration, but it is **deferred** (§9).

## 9. Open gaps

1. **R2 backups**: backups and restores for the Penpot asset bucket and Penpot's Postgres (tracked under OS-113).
2. **Upstream format migration per version bump**: each Penpot bump can migrate file data. A check is needed for each bump: migrate, verify open files, and keep a rollback point.
3. **Promotion workflow**: how a local fork build becomes images on `development` and then lemodesign (build, tag, deploy, roll back).
4. **Server role naming**: whether and how to rename `development` so it is not read as a build host (deferred).
5. **Observability**: logs, metrics and alerts for the Penpot instance, the MCP server and the content-change stream.
6. **Client chrome redirect + open allowlist** in the fork (§2) — not implemented yet.
7. **Identity bridge** (BacksterOS signs contacts into Penpot; encrypted tokens) — not implemented yet.
8. **Task ↔ file/page/element links** and content-change stream consumers — not implemented yet.
