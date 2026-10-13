# Upstream T3 Code sync (BacksterDEV)

> For maintainers of the nested tree under `development/`. Using T3 Code? See [docs/user](../user/).

BacksterDEV vendors [pingdotgg/t3code](https://github.com/pingdotgg/t3code) inside this monorepo and
layers BacksterOS task/servers/control behavior on top. Syncing means bringing a stable upstream tag
in while keeping exclusive Backster paths and re-wiring forked hotspots.

## Current pins

| Item             | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| Nested tree base | `v0.0.45` content (package versions **0.0.44** inside that tag)            |
| Prior base       | `0.0.40` (commit `4a7a7fb`)                                                |
| Reference clone  | `tmp/t3-code-v0045` (repo-root, gitignored)                                |
| Helper script    | [`scripts/sync-upstream-t3code.sh`](../../scripts/sync-upstream-t3code.sh) |
| Hotspot backup   | `tmp/t3-sync-hotspot-backup-20261007-172124`                               |

Refresh the clone when needed:

```bash
# from BacksterOS repo root
git -C tmp/t3-code-v0045 fetch --tags origin
git -C tmp/t3-code-v0045 checkout v0.0.45
```

Or shallow-clone if missing:

```bash
git clone --depth 1 --branch v0.0.45 \
  https://github.com/pingdotgg/t3code.git \
  tmp/t3-code-v0045
```

## Phases

1. **Foundation** — this doc + sync script dry-run + baseline typecheck on the current base.
2. **Mechanical sync** — `scripts/sync-upstream-t3code.sh --apply`, then `vp i`.
3. **Packages + server** — re-attach Backster mounts; typecheck/tests green for packages/server.
4. **Web + desktop** — re-wire Sidebar/compose/desktop forks; smoke BacksterDEV flows.
5. **Mobile + close-out** — accept upstream mobile (Expo 58), full `vp run -r typecheck` / tests.

Primary product path is web + desktop. Mobile is sync-along and verified last.

## Preserve (never overwrite)

These paths are Backster-owned. The sync script excludes them always.

- `apps/web/src/backsteros/`
- `apps/web/src/components/sidebar/Backsteros*`
- `apps/web/src/components/chat/Backsteros*`
- `apps/web/src/components/settings/Backsteros*`
- `apps/web/src/components/servers/`
- `apps/web/src/routes/_chat.backsteros.projects.tsx`
- `apps/web/src/routes/_chat.backsteros.project.$projectId.tsx`
- `apps/server/src/backsteros/`
- `apps/server/src/hetzner/`
- `apps/server/src/cursorPrepaidUsage.ts`
- `apps/server/src/cursorUsage.ts`
- `apps/server/src/cursorUsage.test.ts`
- `packages/shared/src/backsterosTaskAutoPromote.ts`
- `packages/shared/src/backsterosTaskAutoPromote.test.ts`
- `docs/internals/backsteros-control-api.md`
- `docs/user/backsteros-file-task.md`
- `docs/internals/upstream-sync.md` (this file)
- `scripts/sync-upstream-t3code.sh`
- `apps/web/vite.config.ts` (Backster `/backsteros-api` + local-core proxies; mid-merge protect)
- `apps/web/index.html` (BacksterDEV boot splash + document title; mid-merge protect)
- After sync, re-add `packages/shared` export `./backsterosTaskAutoPromote` if missing

Local / generated (also excluded): `.env`, `.t3/`, `node_modules/`, `release/`,
`apps/desktop/.electron-runtime/`, `pnpm-lock.yaml` is synced from upstream on apply (reinstall after).

## Forked hotspots (overwrite upstream, then re-wire)

These exist upstream but carry Backster wiring. On `--apply`, the script backs them up under
`tmp/t3-sync-hotspot-backup-<timestamp>/`, then takes the upstream file. Re-apply Backster behavior
from the backup (do not leave the backup tree as the live source of truth).

- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/AppSidebarLayout.tsx`
- `apps/web/src/components/chat/ComposerSurface.tsx`
- `apps/web/src/components/WorkspacePageContainer.tsx`
- `apps/server/src/http.ts`
- `apps/server/src/server.ts`
- `packages/shared/src/keybindings.ts`
- `apps/desktop/src/app/DesktopEnvironment.ts`
- `apps/desktop/src/electron/ElectronProtocol.ts`
- `AGENTS.md` (keep BacksterDEV / control-API notes when merging)

## Commands

Dry-run (default — no writes):

```bash
cd development
./scripts/sync-upstream-t3code.sh
# or explicitly:
./scripts/sync-upstream-t3code.sh --dry-run
```

Apply (Phase 2 only — after reviewing dry-run):

```bash
./scripts/sync-upstream-t3code.sh --apply
vp i
```

Verify:

```bash
vp run -r typecheck
vp run -r test   # or focused packages while fixing
```

## Baseline (Phase 1, still on 0.0.40)

Recorded 2026-10-07 before any `--apply`:

| Scope                     | Result                                                       |
| ------------------------- | ------------------------------------------------------------ |
| packages + marketing      | typecheck green                                              |
| `apps/web`, `apps/server` | typecheck green (run focused; full `-r` can OOM web)         |
| `apps/desktop`            | pre-existing failures in `ElectronProtocol` / settings types |
| `@t3tools/scripts`        | pre-existing: `knip-schemas.ts` cannot resolve `typescript`  |

Dry-run against `tmp/t3-code-v0045`: all listed hotspots `DIFF`; large transfer (~23k file updates, ~10k deletes). Do not `--apply` until Phase 2 is intentionally started.

## Phase 2–5 status (sync applied and closed out)

Recorded 2026-10-07 after `--apply` from `v0.0.45` (package versions **0.0.44** inside that tag):

- Hotspot backup: `tmp/t3-sync-hotspot-backup-20261007-172124`
- Preserve dirs intact (`backsteros/`, `hetzner/`, etc.)
- Rewired: `http.ts` / `server.ts` mounts, Vite Backster proxies, `ElectronProtocol`,
  `AppSidebarLayout`, `DesktopEnvironment`, keybindings, `AGENTS.md`, shared
  `backsterosTaskAutoPromote` export
- Phase 3: packages + server typecheck green; focused Backster/Hetzner vitests pass
- Phase 4: Backster Sidebar rail + chrome restored; web/desktop typecheck green;
  routeTree covers servers + backsteros + settings
- Phase 5: accepted upstream mobile (Expo **58.0.2**); no Backster mobile fork.
  Typecheck green for contracts/shared/client-runtime/server/web/desktop/mobile.
  Focused vitest: connectAuth + Backster control + Hetzner + publicConfig — 75/75.

### Residual risks

- Full `vp run -r typecheck` can OOM on web in constrained agents; prefer filtered
  package typechecks (as above) plus `vp run --filter @t3tools/mobile typecheck`.
- Sidebar remains a Backster fork of the pre-sync tree with upstream API shims — next
  sync should re-port the rail onto fresh upstream `Sidebar.tsx` rather than replaying
  the old fork wholesale.
- Connect auth keeps Backster hosted `/connect/callback` + optional loopback port while
  retaining upstream `offline_access` scopes.
- No commit/push until an explicit ship request (`/done` or equivalent).

## Done when

- Tree package versions match the target release. ✅ (`0.0.44` / Expo 58)
- Preserve paths unchanged in intent (Backster product behavior intact). ✅
- Hotspots re-wired; BacksterDEV task rail, compose, file-task, servers, and control API work. ✅ (typecheck + focused tests; UI smoke deferred)
- BDV (or successor) task notes the sync SHA and residual risks (especially mobile). ✅ (comments on BDV-48)
