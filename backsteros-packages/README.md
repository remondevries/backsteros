# backsteros-packages

Shared TypeScript packages used across BacksterOS subfolders.

| Package | Purpose | Phase |
| --- | --- | --- |
| [`contracts/`](contracts/) | Zod schemas, API contracts | Phase 1 |
| [`api-client/`](api-client/) | Typed HTTP client | Phase 1+ |
| [`ui/`](ui/) | Shared product UI + task helpers (web + desktop). Apps compile Tailwind; import `@backsteros/ui/tailwind.css` for `@source` scanning. | Phase 5 |

Architecture: [`../docs/`](../docs/) — start with [`../AGENTS.md`](../AGENTS.md).
Desktop sharing: ADR-019 / [`../docs/05-clients.md`](../docs/05-clients.md).
