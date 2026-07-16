# backsteros-sync-demo

Minimal **Phase 3** web client — PowerSync offline task list.

## Prerequisites

1. Local stack running:
   ```bash
   pnpm db:up
   pnpm db:migrate
   pnpm db:powersync-setup
   pnpm powersync:up
   pnpm dev   # API on :8787
   ```
2. PowerSync dev token (matches `POWERSYNC_JWT_SECRET` in API `.env`):
   ```bash
   # With PowerSync CLI installed:
   powersync generate token --subject=owner
   ```
   Or copy a token from the PowerSync service logs if `allow_temporary_tokens` is enabled.

## Run demo

```bash
cp .env.example .env.local
# Set VITE_POWERSYNC_TOKEN to your dev token
pnpm install
pnpm dev
```

Open http://localhost:5173 — add tasks offline, they upload via `POST /api/v1/powersync/write`.

For production, set `VITE_CLERK_TOKEN` to a Clerk session JWT and use `GET /api/v1/powersync/token`.
