# BacksterDEV (not a root workspace package)

`backsterdev/` is a nested T3 Code monorepo with its own lockfile. It is **not** a
member of the root BacksterOS `pnpm-workspace.yaml` (the old `@backsteros/development`
shim `package.json` was removed in BDV-62 / `72fdba7`). Do not re-add
`backsterdev/shim` to the root workspace or lockfile.

```bash
cd backsterdev && pnpm install
cd backsterdev && pnpm run dev          # web stack
cd backsterdev && pnpm run dev:desktop  # Electron
```
