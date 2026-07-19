# backsteros-admin

**Ops / API dashboard** — health, sync cursor, log tail (Phase 3b).

| Surface | URL |
| --- | --- |
| Web | `https://backsteros.com/admin` |
| Local | `http://127.0.0.1:5174/admin/` |

**Not** for creating tasks or editing markdown — that is [`backsteros-app`](../backsteros-app/) (`/app`).

## Status

- Clerk owner gate
- API `/health`
- Sync health (`GET /api/v1/ops/sync-health`) — cursor, devices, events/hour
- Log tail (`GET /api/v1/ops/logs`) — in-process ring buffer

Owner access: workspace `owner` membership, workspace `ownerUserId`, or
`ADMIN_OWNER_USER_IDS` on the API.

## Develop

```bash
cp backsteros-admin/.env.example backsteros-admin/.env
# Set VITE_API_URL + VITE_CLERK_PUBLISHABLE_KEY
pnpm install
pnpm --filter @backsteros/admin dev
```

Specs: [`../docs/11-urls-and-routing.md`](../docs/11-urls-and-routing.md), Phase 3b in [`../docs/09-phased-build-plan.md`](../docs/09-phased-build-plan.md).
