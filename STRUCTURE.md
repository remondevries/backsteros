# BacksterOS — folder structure

Single workspace: **`~/code/backsteros/`**

```text
~/code/backsteros/
├── AGENTS.md
├── README.md
├── STRUCTURE.md
├── docs/
│
├── backsteros-api/            Phase 1 — backend (service.backsteros.com)
├── backsteros-packages/
│   ├── contracts/
│   └── api-client/
│
├── backsteros-app/            Phase 5 — product web (backsteros.com/app, Next.js)
├── backsteros-admin/          Phase 3b — ops dashboard (backsteros.com/admin)
├── backsteros-mobile/         Phase 4 — Expo (product, not admin)
└── backsteros-desktop/        Phase 5 — Tauri 2 + Vite/React scaffold (UI ≈ web)
```

## URLs

| Path | Folder |
| --- | --- |
| `backsteros.com/app` | `backsteros-app` |
| `backsteros.com/admin` | `backsteros-admin` |
| `service.backsteros.com` | `backsteros-api` |

Details: [docs/11-urls-and-routing.md](docs/11-urls-and-routing.md)

## Phase → folder

| Phase | Folder |
| --- | --- |
| 1 | `backsteros-api/`, `backsteros-packages/contracts/` |
| 3b | `backsteros-admin/` (after sync metrics exist) |
| 4 | `backsteros-mobile/` |
| 5 | `backsteros-app/`, `backsteros-desktop/` |
