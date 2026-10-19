# BacksterDESIGN

This directory is the **Penpot fork** for BacksterDESIGN (same role as `development/` for BacksterDEV).

- Product notes: [`docs/19-penpot-integration.md`](../docs/19-penpot-integration.md)
- Branding: `branding/` (`pnpm --filter @backsteros/design branding:apply`)
- Desktop (Tauri): `desktop/` — see `desktop/README.md`
- React islands (shared `@backsteros/ui`): `bridge/` — `pnpm --filter @backsteros/design bridge:build`
- Deploy (fork → `design.lemo-design.com` on `ssh lemodesign`): `deploy/README.md`
- Upstream pin: Penpot **2.18.3**

## Local run

From the BacksterOS repo root (Docker required):

```bash
pnpm --filter @backsteros/design dev          # start devenv
# → https://localhost:3449
pnpm --filter @backsteros/design dev:attach
pnpm --filter @backsteros/design dev:down

# Desktop shell (needs a reachable Penpot URI; default localhost:3449)
pnpm --filter @backsteros/design-desktop tauri:dev
# or: pnpm --filter @backsteros/design desktop
```

Or from this folder: `./scripts/backster-dev.sh up`

Root shim: `pnpm --filter @backsteros/design …`
