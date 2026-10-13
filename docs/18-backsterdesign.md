# 18 · BacksterDESIGN

Design workspace for BacksterOS — a **forked Penpot** under `design/`, parallel to BacksterDEV under `backsterdev/`.

| Product | Folder | Local start |
| --- | --- | --- |
| BacksterOS | repo root (`core/`, `backsteros/`, …) | `pnpm --filter @backsteros/desktop dev` / hub |
| BacksterDEV | `backsterdev/` | `pnpm --filter @backsteros/development dev` |
| BacksterDESIGN | `design/` | `pnpm --filter @backsteros/design dev` |

## Why a fork

Penpot plugins cover canvas tooling, but not first-class product chrome or deep BacksterOS integration. Upstream also lacks **per-project member visibility** (roles are team-wide only; see [penpot#8860](https://github.com/penpot/penpot/issues/8860)).

Forking lets us own UI, permissions, and OS bridges over time.

## Layout

```text
design/                    ← vendored Penpot (pinned) + Backster overlays
├── frontend/ backend/ …      upstream tree
├── branding/                 BacksterDESIGN assets + apply scripts
├── deploy/                   self-host / compose notes (remote instance)
├── scripts/backster-dev.sh   local devenv wrapper
├── manage.sh                 upstream Penpot devenv manager
└── BACKSTER.md               short entry
```

Root filter shim: `pnpm --filter @backsteros/design …` → `tooling/design/`.

## Local development (foundation)

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
| Source bind | `design/` → `/home/penpot/penpot` in the devenv container |
| Pin | Penpot **2.18.3** (see `design/BACKSTER.md`) |

This is Penpot’s official **devenv** (compile frontend/backend inside Docker). It is the correct way to develop on the fork — same idea as running BacksterDEV’s nested app, with a heavier toolchain.

### Also useful

```bash
pnpm --filter @backsteros/design penpot:status      # tree / branding checklist
pnpm --filter @backsteros/design branding:apply     # logos + brand chrome into design/ source (+ live public/)
pnpm --filter @backsteros/design branding:apply:host  # stock Docker host only (ssh development)
```

## Runtime map

| Environment | What |
| --- | --- |
| **Local devenv** | `pnpm --filter @backsteros/design dev` — work on the fork |
| **Shared instance** | SSH host `development` — `/home/deploy/penpot` stock images + branding (team use) |
| **Source of truth** | `design/` in this monorepo |

## Direction

1. Vendor & pin Penpot in `design/` (done).
2. Local devenv as the default edit/run loop (this doc).
3. Build custom images from `design/` when ready to replace the shared stock instance.
4. Land features in source (permissions, BacksterOS panels, native chrome); drop temporary CSS/JS injects as they are replaced.

## Non-goals (for now)

- Replacing Penpot’s canvas engine.
- Publishing a public SaaS fork.
