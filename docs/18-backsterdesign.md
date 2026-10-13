# 18 · BacksterDESIGN

Design workspace for BacksterOS — a **forked Penpot** under `design/`, parallel to BacksterDEV under `development/`.

| Product | Folder | Codebase |
| --- | --- | --- |
| BacksterOS | repo root (`core/`, `desktop/`, …) | Ops system |
| BacksterDEV | `development/` | T3 Code (nested) |
| BacksterDESIGN | `design/` | Penpot fork (nested) |

## Why a fork

Penpot plugins cover canvas tooling, but not first-class product chrome or deep BacksterOS integration. Upstream also lacks **per-project member visibility** (roles are team-wide only; see [penpot#8860](https://github.com/penpot/penpot/issues/8860)).

Forking lets us own UI, permissions, and OS bridges over time.

## Layout

```text
design/                 ← vendored Penpot (pinned release) + Backster overlays
├── frontend/ backend/ …   upstream tree
├── branding/              BacksterDESIGN assets + apply scripts
├── deploy/                self-host / compose notes
└── (Penpot build files)
```

Root filter shim: `pnpm --filter @backsteros/design …` → `tooling/design/`.

## Runtime today

| Piece | Where |
| --- | --- |
| Live instance | SSH host `development` — `/home/deploy/penpot` (stock images + branding) |
| Source of truth for fork work | `design/` in this monorepo |
| Branding overlays | `design/branding/` |

Branding can still be applied onto the running frontend container via `design/branding/bin/apply-branding.sh` until custom images are built from the fork.

## Direction

1. Vendor & pin Penpot in `design/` (done at a 2.18.x tag).
2. Build custom images from `design/` when core changes are needed.
3. Land features in source (permissions, BacksterOS panels, native chrome) and drop temporary CSS/JS injects as they are replaced.

## Non-goals (for now)

- Replacing Penpot’s canvas engine.
- Publishing a public SaaS fork.
