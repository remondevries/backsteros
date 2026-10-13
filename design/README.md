# BacksterDESIGN (`design/`)

Design workspace for BacksterOS — a **forked / customized Penpot** so we can go beyond plugin limits (deeper BacksterOS integration, permissions, chrome, etc.).

## Layout

```text
design/
├── branding/     BacksterDESIGN assets + apply scripts (overlay on Penpot frontend)
├── deploy/       Self-host compose notes / overlays (dev server today)
├── docs/         Fork plan and product notes
├── scripts/      Small helpers
└── penpot/       (next) vendored Penpot fork — not checked in yet
```

## Why a fork

Penpot plugins are strong for canvas tools, but weak for first-class product chrome and deep OS integration. Stock self-hosted also lacks per-project member visibility (team-wide roles only). Forking lets us own the UI and data model over time.

## Today

- Runtime still runs on the **development** host (`ssh development`, compose under `/home/deploy/penpot`).
- Branding overlays live here and can be applied with `./branding/bin/apply-branding.sh` against that frontend container.
- The Penpot source fork will land under `design/penpot/` (vendor upstream, then diverge).

## Scripts

```bash
pnpm --filter @backsteros/design penpot:status
pnpm --filter @backsteros/design branding:apply   # needs PENPOT_FRONTEND_CONTAINER / docker access
```

Root shim: `pnpm --filter @backsteros/design …` via `tooling/design/`.
