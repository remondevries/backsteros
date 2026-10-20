# BacksterDESIGN

This directory is the **Penpot fork** for BacksterDESIGN (same role as `development/` for BacksterDEV).

- Product notes: [`docs/19-penpot-integration.md`](../docs/19-penpot-integration.md)
- Branding: `branding/` (`pnpm --filter @backsteros/design branding:apply`)
- Desktop (Tauri): `desktop/` — see `desktop/README.md`
- React islands (shared `@backsteros/ui`): `bridge/` — `pnpm --filter @backsteros/design bridge:build`
- Deploy (fork → `design.lemo-design.com` on `ssh lemodesign`): `deploy/README.md`
- Upstream pin: Penpot **2.18.3**

## Local run (change / test)

Local devenv and hosted `design.lemo-design.com` are separate. Use local while
editing the fork; deploy to lemodesign for real staff/client work
(`deploy/README.md`).

From the BacksterOS repo root (Docker required):

```bash
pnpm --filter @backsteros/design dev          # start devenv
# → https://localhost:3449
pnpm --filter @backsteros/design dev:attach
pnpm --filter @backsteros/design dev:down

# Desktop shell against local Penpot (default for tauri:dev)
pnpm --filter @backsteros/design-desktop tauri:dev
# or: pnpm --filter @backsteros/design desktop

# Optional: shell against hosted while still in tauri:dev
pnpm --filter @backsteros/design-desktop tauri:dev:hosted
```

Installed / `tauri:build` apps load `https://design.lemo-design.com`.

Staff login (same email/password as hosted): put values in
`~/.config/secrets/backsterdesign.env`, then
`./scripts/backster-dev.sh ensure-staff` while devenv is up.

**Files:** local RustFS and hosted R2 do **not** live-sync (separate DBs +
stores). See `desktop/README.md`.

Health check (local + hosted, no secrets printed):

```bash
./scripts/backster-dev.sh audit
```

Or from this folder: `./scripts/backster-dev.sh up`

Root shim: `pnpm --filter @backsteros/design …`
