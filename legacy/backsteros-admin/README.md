# backsteros-admin

**Ops / API dashboard** — Next.js + Clerk (Phase 3b).

| Surface | URL |
| --- | --- |
| Web | `https://backsteros.com/admin` |
| Local | `http://127.0.0.1:3200` |

**Not** for creating tasks or editing markdown — that is [`backsteros-app`](../backsteros-app/) (`/app`).

## Status

- Next.js App Router + `@clerk/nextjs` (same auth gate pattern as `backsteros-development`)
- Nav: **Dashboard** (API health), **Sync**, **Logs**, **Recurring** (UTC cron templates)
- Same-origin proxies for `/api/health` and `/api/v1/*`

Owner access: workspace `owner` membership, workspace `ownerUserId`, or
`ADMIN_OWNER_USER_IDS` on the API.

## Develop

```bash
cp backsteros-admin/.env.example backsteros-admin/.env
# Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (+ optional NEXT_PUBLIC_API_URL)
pnpm install
pnpm --filter @backsteros/admin dev
```

Production builds behind nginx at `/admin` should set `NEXT_PUBLIC_BASE_PATH=/admin`.

Specs: [`../docs/11-urls-and-routing.md`](../docs/11-urls-and-routing.md), Phase 3b in [`../docs/09-phased-build-plan.md`](../docs/09-phased-build-plan.md).
