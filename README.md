# BacksterOS

Everything under **`~/code/backsteros/`**.

## Workspace layout

```text
backsteros/
├── docs/                  Architecture specs
├── backsteros-api/        Backend (service.backsteros.com)
├── backsteros-app/        Product web (backsteros.com/app, Next.js)
├── backsteros-admin/      Ops dashboard (backsteros.com/admin)
├── backsteros-mobile/     Expo — product only
├── backsteros-desktop/    Tauri 2 + Vite/React (UI ≈ web app)
└── backsteros-packages/   Shared contracts + api-client
```

| URL | What |
| --- | --- |
| `/app` | Tasks, markdown, PDFs — **daily product** |
| `/admin` | Logs, sync, API health — **not** task editing |

[STRUCTURE.md](STRUCTURE.md) · [docs/11-urls-and-routing.md](docs/11-urls-and-routing.md)

## For AI agents

Read **[AGENTS.md](AGENTS.md)** first.

## Documentation

| Doc | Topic |
| --- | --- |
| [docs/11-urls-and-routing.md](docs/11-urls-and-routing.md) | /app vs /admin, deployment |
| [docs/05-clients.md](docs/05-clients.md) | App, admin, mobile, desktop |
| [docs/09-phased-build-plan.md](docs/09-phased-build-plan.md) | Build order |
| [docs/llms.txt](docs/llms.txt) | Full index |

## Related (outside workspace)

- [circle.remondevries.com](../circle.remondevries.com) — legacy
- [backsteros-agent](../backsteros-agent) — Cursor console
