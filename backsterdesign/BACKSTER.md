# BacksterDESIGN

This directory is the **Penpot fork** for BacksterDESIGN (same role as `development/` for BacksterDEV).

- Product notes: [`docs/19-penpot-integration.md`](../docs/19-penpot-integration.md)
- Branding: `branding/` (`pnpm --filter @backsteros/design branding:apply`)
- Deploy notes (shared host): `deploy/`
- Upstream pin: Penpot **2.18.3**

## Local run

From the BacksterOS repo root (Docker required):

```bash
pnpm --filter @backsteros/design dev          # start devenv
# → https://localhost:3449
pnpm --filter @backsteros/design dev:attach
pnpm --filter @backsteros/design dev:down
```

Or from this folder: `./scripts/backster-dev.sh up`

Root shim: `pnpm --filter @backsteros/design …`
