# @backsteros/development (workspace shim)

Thin proxy so root filter commands reach the nested T3 Code monorepo without hoisting `development/` into the BacksterOS workspace.

```bash
# from repo root
pnpm --filter @backsteros/development dev
pnpm --filter @backsteros/development dev:desktop
```

Implementation lives in `development/` (`@t3tools/monorepo` with its own lockfile). Run installs there directly when working on T3 Code:

```bash
cd development && pnpm install
```
