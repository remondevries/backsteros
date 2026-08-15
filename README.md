# BacksterOS

Everything under **`~/code/backsteros/`** (v2).

## Workspace layout

```text
backsteros/
├── docs/           Architecture specs
├── core/
│   ├── server/     API (Hono + Postgres) — runs on a local computer
│   └── packages/   contracts, api-client, powersync-schema
├── hub/            macOS menu-bar start/stop for local services
├── mobile/         Expo (iPhone + iPad)
├── desktop/        Tauri 2 + Vite/React (macOS)
└── legacy/         v1 snapshot (reference only)
```

[STRUCTURE.md](STRUCTURE.md) · [docs/12-v2-local-computer.md](docs/12-v2-local-computer.md)

## Quick start

Root scripts are for **core / API / infra** only. Client apps live in their folders.

```bash
pnpm --filter @backsteros/hub dev      # menu bar → Start all (Docker + API + PTY)
# or manually:
pnpm db:up && pnpm db:migrate && pnpm dev   # core API on :8788

pnpm --filter @backsteros/mobile dev   # Expo
pnpm --filter @backsteros/desktop dev  # Tauri product UI
```

Or from each package directory: `cd mobile && pnpm dev`, `cd desktop && pnpm dev`, `cd hub && pnpm dev`.

## For AI agents

Read **[AGENTS.md](AGENTS.md)** first.

## Documentation

| Doc | Topic |
| --- | --- |
| [docs/12-v2-local-computer.md](docs/12-v2-local-computer.md) | v2 local-computer model |
| [docs/09-phased-build-plan.md](docs/09-phased-build-plan.md) | Build order |
| [docs/llms.txt](docs/llms.txt) | Full index |

## Related (outside workspace)

- [circle.remondevries.com](../circle.remondevries.com) — legacy monolith
