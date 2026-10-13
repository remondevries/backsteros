# @backsteros/development (workspace shim)

Thin proxy so root filter commands reach the nested T3 Code monorepo without hoisting `development/` into the BacksterOS workspace.

## Run the desktop app (Electron)

```bash
# from repo root
pnpm --filter @backsteros/development dev:desktop
```

## Browser / web stack only

`dev` starts the nested monorepo’s web dev stack (no Electron window):

```bash
pnpm --filter @backsteros/development dev
```

Implementation lives in `development/` (`@t3tools/monorepo` with its own lockfile). Run installs there directly when working on T3 Code:

```bash
cd development && pnpm install
```
