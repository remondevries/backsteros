# BacksterOS

Everything under **`~/code/backsteros/`** (v2).

## Workspace layout

```text
backsteros/
├── docs/           Architecture specs
├── core/
│   ├── server/     API (Hono + Postgres) — runs on a local computer
│   └── packages/   contracts, api-client, powersync-schema
├── mobile/         Expo (iPhone + iPad)
├── desktop/        Tauri 2 + Vite/React (macOS)
└── legacy/         v1 snapshot (reference only)
```

[STRUCTURE.md](STRUCTURE.md) · [docs/12-v2-local-computer.md](docs/12-v2-local-computer.md)

## Quick start

```bash
pnpm db:up
pnpm db:migrate
pnpm --filter @backsteros/server dev   # http://localhost:8787/health
pnpm dev:mobile                        # Expo
pnpm dev:desktop                       # Tauri
```

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
