# backsteros-sync-demo

Minimal **Phase 3** web client — PowerSync offline task list.

## Local development (docker stack)

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
   pnpm --filter @backsteros/api db:powersync-token owner
   ```

```bash
cp .env.example .env.local
# Set VITE_POWERSYNC_TOKEN to the dev token above
pnpm install
pnpm dev
```

Open http://localhost:5173 — add tasks offline, they upload via `POST /api/v1/powersync/write`.

## Production end-to-end test

Uses live API + PowerSync with Clerk sign-in (no manual JWT paste).

```bash
cp .env.prod.example .env.prod
pnpm install
pnpm dev:prod
```

Open http://localhost:5173, sign in with Clerk, then add tasks. Flow:

1. Clerk session → `GET https://service.backsteros.com/api/v1/powersync/token`
2. PowerSync syncs from `https://sync.backsteros.com`
3. Local writes upload to `POST /api/v1/powersync/write`

Config is in `.env.prod` (copy from `.env.prod.example`).

**Note:** Production API CORS must include `http://localhost:5173` for local demo testing (`config/deploy.yml`).
