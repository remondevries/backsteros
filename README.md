# BacksterOS

Everything under **`~/BacksterOS/Projects/OS/Codebase/`**.

## Workspace layout

```text
backsteros/   (repo root)
├── docs/           Architecture specs
├── core/
│   ├── server/     API (Hono + Postgres) — runs on a local computer
│   └── packages/   contracts, api-client, powersync-schema
├── mobile/         Expo (iPhone + iPad)
├── backsteros/     Tauri 2 + Vite/React (macOS) — package @backsteros/desktop
├── agents/         Public HTTPS door (agent.backsteros.com)
├── backsterdev/    T3 Code agent console (nested monorepo; own lockfile)
│   └── shim/       shim for `pnpm --filter @backsteros/development …`
├── backstermeet/   BacksterMeet — Tauri 2 Director app for live meetings (@backsteros/meet)
├── backsterdesign/ BacksterDESIGN (vendored Penpot fork + branding + local devenv)
└── tooling/design/ shim for `pnpm --filter @backsteros/design …`
```

v1 Next apps are archived at `~/code/archive/backsteros-legacy/` (not in this workspace).
[STRUCTURE.md](STRUCTURE.md) · [docs/12-v2-local-computer.md](docs/12-v2-local-computer.md) · [docs/20-repo-structure.md](docs/20-repo-structure.md)

## Quick start

Root scripts are for **core / API / infra** only. Client apps live in their folders.

```bash
pnpm db:up && pnpm db:migrate && pnpm dev   # core API on :8788

pnpm --filter @backsteros/mobile dev   # Expo
pnpm --filter @backsteros/desktop dev  # Tauri product UI
pnpm --filter @backsteros/development dev:desktop  # T3 Code agent console (Electron)
pnpm --filter @backsteros/meet tauri dev          # BacksterMeet Director (Tauri, :1430)
# browser/web stack only (no Electron window):
pnpm --filter @backsteros/development dev
pnpm --filter @backsteros/design penpot:status      # BacksterDESIGN tree check
pnpm --filter @backsteros/design dev                # BacksterDESIGN local Penpot devenv (Docker)
# → https://localhost:3449
```

Or from each package directory: `cd mobile && pnpm dev`, `cd backsteros && pnpm dev`.

## For AI agents

Read **[AGENTS.md](AGENTS.md)** first.

## Documentation

| Doc | Topic |
| --- | --- |
| [docs/12-v2-local-computer.md](docs/12-v2-local-computer.md) | v2 local-computer model |
| [docs/19-penpot-integration.md](docs/19-penpot-integration.md) | BacksterDESIGN (Penpot fork + local devenv + integration) |
| [docs/09-phased-build-plan.md](docs/09-phased-build-plan.md) | Build order |
| [docs/llms.txt](docs/llms.txt) | Full index |

## Related (outside workspace)

- [circle.remondevries.com](../circle.remondevries.com) — legacy monolith
