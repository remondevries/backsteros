# 20 · Repo structure

**Status:** Partially executed (13 Oct 2026). `desktop/` → `backsteros/`, `development/` → `backsterdev/` (shim at `backsterdev/shim/`), `hub/` removed. `backstermeet/` added (copied from `~/code/backstermeet`, 13 Oct 2026). `design/` → `backsterdesign/` done (`tooling/design/` shim kept, repointed to `backsterdesign/`). Working tree only — not committed.
**Execution:** See [STRUCTURE.md](../STRUCTURE.md) for the current folder map.
**Related:** [STRUCTURE.md](../STRUCTURE.md), [ADR-035](10-decisions-log.md) (cloud-core center, desktop-owned local-core), [12-v2-local-computer.md](12-v2-local-computer.md), [13-hybrid-cloud-local-core.md](13-hybrid-cloud-local-core.md), [17-desktop-without-docker.md](17-desktop-without-docker.md), [19-penpot-integration.md](19-penpot-integration.md) (BacksterDESIGN / Penpot).

## 1. Goal

One top-level folder per product, plus one shared `core/`. Product names match the folder names (BacksterOS → `backsteros/`, BacksterDEV → `backsterdev/`, BacksterDESIGN → `backsterdesign/`). New products slot into the same pattern.

## 2. Target top-level structure

```text
~/BacksterOS/Projects/OS/Codebase/
├── core/              ← cloud core + local core (shared logic, two deployment targets) — see §4 open point
├── backsteros/        ← was backsteros/      — BacksterOS desktop app (Tauri)
├── backsterdev/       ← was backsterdev/  — development app (T3 Code fork, Electron)
├── backsterdesign/    ← was design/       — Penpot fork + its Tauri wrapper
├── mobile/            ← unchanged         — iOS / mobile (Expo)
├── backstermeet/      ← new (from ~/code/backstermeet) — BacksterMeet Director app (Tauri)
├── <future product>/  ← one folder per product, same pattern
├── docs/  deploy/  scripts/  tooling/  patches/  agents/   ← see §5
```

| Folder | Change | Contents |
| --- | --- | --- |
| `core/` | Keep, restructure | **Both** cloud core and local core. Same shared logic, two deployment targets: one points at the server (cloud), one runs embedded (local). Both depend on one shared core package/crate — no duplication. |
| `backsteros/` | Rename from `backsteros/` | The BacksterOS desktop app (Vite/React + `src-tauri/`, `packages/ui/`). |
| `backsterdev/` | Rename from `backsterdev/` | The development application (nested T3 Code monorepo; its desktop app is Electron in `apps/desktop/`). |
| `backsterdesign/` | Rename from `design/` | The Penpot codebase **plus** a Tauri wrapper, following the same pattern as BacksterDEV's Electron app (product codebase + native shell in one product folder). The Tauri wrapper does not exist yet. |
| `mobile/` | Keep name | iOS / mobile (Expo). |
| `backstermeet/` | **Added** (from `~/code/backstermeet`) | BacksterMeet — Backster Suite product. Tauri 2 + Vite/React **Director** (host control surface) for live meetings; the client portal is the guest side, both on one LiveKit SFU. Workspace package `@backsteros/meet`. See `backstermeet/AGENTS.md` and §8. |
| `hub/` | **Remove** | BacksterHub is unused. See §3. |

### Today vs target

- `core/` today is TypeScript: `core/server/` (Hono API, runs as cloud-core on the VPS and as local-core on the Mac) and `core/packages/*` (contracts, api-client, cli, powersync-schema). Cloud vs local is a deployment difference already (`deploy/cloud/` vs `scripts/local-core/`), not two codebases.
- The desktop Rust side (`backsteros/src-tauri/src/local_core.rs`) only supervises local-core (calls `scripts/local-core/ensure-once.sh`, version-mismatch warning). It does not contain core logic.
- The brief says "shared core **crate**". Today the shared logic is a TS package, not a Rust crate. Whether "crate" means a future Rust core or just "shared package" is part of the §4 decision.

## 3. `hub/` — remove

**Decision:** remove `hub/` (`@backsteros/hub`, Tauri menu-bar app, 36 tracked files). BacksterHub is unused.

Things the removal task must clean up at the same time (found read-only, not changed):

- `pnpm-workspace.yaml` lists `hub` as a workspace package.
- `STRUCTURE.md`, `AGENTS.md`, `README.md`, `docs/llms.txt` (`> Code:` line) mention `hub/`.
- Docs still describe Hub as one way to start the optional replica and as the owner of PTY + Expo start: `README.md`, [12](12-v2-local-computer.md), [17](17-desktop-without-docker.md), ADR-035. The LaunchAgent (`scripts/local-core/`) and `BACKSTEROS_START_LOCAL_REPLICA=1` already cover replica start. **Check before deleting:** where PTY/Expo start goes if anyone still uses Hub for it.

## 4. Open point — where local core lives (UNRESOLVED, for Remon)

> ⚠️ **Unresolved decision.** The brief contains two statements that pull in different directions. Both are recorded here. Nothing is picked until Remon decides.

**Statement A:** "`core/` contains **both** cloud core and local core. Same shared logic, two deployment targets: one points at the server (cloud), one runs embedded (local). A shared core crate that both depend on — no duplication."

**Statement B:** "Local core **folds into `backsteros/`** since it lives with the desktop app."

How each reads against existing specs:

| | A — local core in `core/` | B — local core in `backsteros/` |
| --- | --- | --- |
| Fits | Today's code: one `core/server` serves both targets. "Business logic in `core/server/` only" (llms.txt conventions). | ADR-035: "Its lifecycle belongs to the **desktop app**." Local-core is the Mac replica for desktop only; iOS must not depend on it. |
| Risk | Desktop-only replica code (LaunchAgent scripts, supervisor) stays outside the product folder. | Splits core logic across two top-level folders unless only the *embedding/runner* moves and logic stays in `core/`. |

A possible middle reading (not decided): shared logic and both deployment entrypoints stay in `core/`; `backsteros/` owns only the embedding/lifecycle glue (today `src-tauri/src/local_core.rs`, maybe `scripts/local-core/`). This is listed so it can be accepted or rejected, not as a choice.

Questions for Remon:

1. A, B, or the middle reading?
2. Does "embedded" local core mean the existing Node `core/server` run by the desktop, or a future Rust crate inside the Tauri app?
3. Where do `scripts/local-core/` and `deploy/local-core.env.example` go under the chosen option?

## 5. Remaining-folder cleanup review

Inspected read-only on 13 Oct 2026. "Tracked" = files in git.

| Folder | What is there | Finding |
| --- | --- | --- |
| `agents/` | `@backsteros/agents` — VPS HTTPS door for always-on agents → cloud-core (Hono, 9 tracked files, workspace member). Runs on Hetzner `lemodesign`. | **Needed.** Live production service. Could later move under `core/` (it is a cloud deployment beside cloud-core) — optional, not required. |
| `deploy/` | `cloud/` (cloud-core image, deploy scripts, PowerSync config render), `backsteros-server/` (Hetzner host notes, client-portal compose + nginx), `powersync/` (local PowerSync config), `dynamic-island/backsteros.env.example`, `local-core.env.example`. 19 tracked. Referenced by ADR-035, 13, `scripts/local-core/`. | **Needed.** Keep at root as shared ops. Option: move `local-core.env.example` next to wherever local core lands (§4). `dynamic-island/` is one env example for the Dynamic Island menu-bar app (CLI + server routes exist) — keep. **Known gap:** `deploy/` only ships the cores and the other apps; Penpot's eight containers and the `lemodesign` promotion path are not covered yet. Gap between `deploy/` and `backsterdesign/` (BacksterDESIGN) — must be addressed when Penpot is promoted to `lemodesign`. |
| `node_modules/` | Root pnpm store (`.pnpm/`, workspace state, `.vite-temp/`), ~5.1 GB. Git-ignored, 0 tracked. | **Build artifact.** Not a cleanup target; regenerated by `pnpm install`. Will be rebuilt after renames (workspace paths change). |
| `patches/` | One pnpm patch: `@pierre/diffs@1.3.0-beta.10` (registered in `pnpm-workspace.yaml` `patchedDependencies`). Used by `backsteros/packages/ui`. | **Needed.** Must stay at root (pnpm resolves it from the root workspace). Remove only when the patch is dropped upstream. |
| `scripts/` | `db-down.sh` (root `pnpm db:down`), `local-core/` (LaunchAgent install/run, ensure-once, update-build, tests). 10 tracked. Called by `backsteros/src-tauri/src/local_core.rs`, core tests, docs. | **Needed.** `db-down.sh` stays at root. `local-core/` may relocate with local core (§4) — then update `local_core.rs`, `core/server/src/lib/local-postgres-publish.test.ts`, deploy/cloud README, docs 12/13/17. |
| `tmp/` | Git-ignored, 0 tracked, ~713 MB: `t3-code/` (Jul), `t3-code-v0045/` (Oct 7), two `t3-sync-hotspot-backup-20261007-*` copies. Upstream T3 Code snapshots/backups from `backsterdev/` work; no tracked references. | **Can be removed** (transient). Confirm with whoever did the 7 Oct T3 sync that the backups are no longer needed first. |
| `tooling/` | `backsterdev/` (`@backsteros/development` filter shim → `backsterdev/`), `design/` (`@backsteros/design` shim → `backsterdesign/`, `status.mjs`). 5 tracked, workspace members. | **Needed for now.** Rename to `tooling/backsterdev/` and `tooling/backsterdesign/` with the product renames (paths `../../development`, `../../design` must change), or fold each shim into its product folder later. Package names can stay. |

Also seen at root (not in the brief, untouched): `.worktrees/` is empty; `.migration-reports/` holds git-ignored Circle migration JSON from 16 Jul 2026 — candidates for removal later.

## 6. What the execution task must update

Not done here. Listed so the later task does not miss anything:

- `pnpm-workspace.yaml` package paths (`backsteros`, `backsteros/packages/*`, `backsterdev/shim`, `tooling/design` (no hub)).
- Root `package.json` scripts only use filters — check they still resolve.
- `.github/workflows/ci.yml` and `desktop-release.yml` (`backsteros/` paths, bundle paths under `backsteros/src-tauri/target/…`).
- `.gitignore` (`backsteros/packages/ui/src/**/*.js`).
- `tooling/*` shim paths, `backsteros/src-tauri/src/local_core.rs` repo-relative paths.
- `STRUCTURE.md`, `AGENTS.md`, `README.md`, `docs/llms.txt`, docs 05/12/13/17/19 and `backsterdesign/BACKSTER.md` path mentions.
- Coordinate with active herdr agents first: renaming `design/` / `backsterdev/` / `backsteros/` under uncommitted changes will collide.

## 7. BacksterMeet fold-in (executed 13 Oct 2026, working tree only)

Copied `~/code/backstermeet` → `backstermeet/` without `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/`, `package-lock.json` (npm → pnpm). Package renamed `backstermeet` → `@backsteros/meet`, added to `pnpm-workspace.yaml`, `typecheck` script added (runs in root `pnpm typecheck`). Stale UI path `../backsteros/desktop/packages/ui/src` fixed to `../backsteros/packages/ui/src` in `vite.config.ts` and `tsconfig.json` (source-path alias; `@backsteros/ui` does not export that icon from `dist/`). The old `~/code/backstermeet` copy still exists — retire it once this one is confirmed.

**Open gaps (not fixed):**

- **No production meetings API path.** The meetings picker reaches BacksterOS `/api/v1/meetings` only through a **dev-only** Vite proxy (`vite-plugin-backsteros-meetings.ts`, reads `~/.config/backsteros/cli.env`). A built Tauri app has no route to cloud-core meetings yet (needs a Rust command or api-client + auth story).
- **LiveKit credentials (security).** `backstermeet/README.md` documents `LIVEKIT_API_KEY=devkey` / `LIVEKIT_API_SECRET=secret`. These must match the Hetzner `livekit.yaml`; if production really uses dev keys, rotate them. Keep real values only in Infisical / `~/.config/secrets/livekit.env`.
- No `lint` script yet (other product folders use eslint/oxlint; not set up for BacksterMeet). Not in CI / release workflows.

## 8. Non-goals

- No package renames (`@backsteros/*` names stay).
- No change to runtime topology (ADR-035 still holds).
