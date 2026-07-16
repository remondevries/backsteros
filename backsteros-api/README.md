# backsteros-api

Backend service for **BacksterOS** — Hono + PostgreSQL + OpenAPI.

**Host:** `https://service.backsteros.com`  
**Status:** Phase 3 — PowerSync sync (local stack + API routes)

## Quick start (local)

From the workspace root:

```bash
# 1. Start Postgres
pnpm db:up

# 2. Configure env
cp backsteros-api/.env.example backsteros-api/.env
# Edit CLERK_SECRET_KEY when you have Clerk set up

# 3. Migrate + bootstrap API key
pnpm db:migrate
pnpm --filter @backsteros/api db:seed
# Save the sk_live_... secret — shown once

# 4. Run API
pnpm dev
```

- Health: http://localhost:8787/health  
- OpenAPI: http://localhost:8787/api/v1/openapi.json

## Test with curl

```bash
export API_KEY="sk_live_..."  # from db:seed

curl http://localhost:8787/health

curl -X POST http://localhost:8787/api/v1/tasks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"My task"}'
```

## Auth

| Caller | Header |
| --- | --- |
| Agents / automation | `Authorization: Bearer sk_live_...` |
| Human (create API keys) | `Authorization: Bearer <Clerk JWT>` |

API key management (`/api/v1/api-keys`) requires a **Clerk session**. Task/project CRUD uses **API keys** with scopes (`tasks:read`, `tasks:write`, etc.).

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Dev server (workspace root) |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm --filter @backsteros/api db:seed` | Create bootstrap API key (dev) |
| `pnpm --filter @backsteros/api db:generate` | Generate migration from schema changes |
| `pnpm db:powersync-setup` | Create `powersync` publication (after migrate) |
| `pnpm powersync:up` | Start PowerSync + Mongo (docker compose) |
| `pnpm --filter @backsteros/api db:powersync-token owner` | Dev JWT for local PowerSync |

## Phase 3 — PowerSync (local)

```bash
pnpm db:up
pnpm db:migrate
pnpm db:powersync-setup
pnpm powersync:up
pnpm dev

# In another terminal — sync demo web client
cd backsteros-sync-demo
cp .env.example .env.local
pnpm --filter @backsteros/api db:powersync-token owner  # paste into VITE_POWERSYNC_TOKEN
pnpm dev
```

Sync API (Clerk session): `POST /api/v1/sync/bootstrap`, `GET /api/v1/sync/pull`, `POST /api/v1/sync/push`  
PowerSync uploads: `POST /api/v1/powersync/write` (Clerk JWT or PowerSync dev token)

Production Neon setup: [`../deploy/powersync/neon-setup.sql`](../deploy/powersync/neon-setup.sql)

## Production (Neon)

Set `DATABASE_URL` in deploy env to your Neon connection string (PostgreSQL 17, EU region recommended).

Enable logical replication in Neon console before **Phase 3** (PowerSync).

## Architecture

Specs: [`../docs/`](../docs/) — [`../AGENTS.md`](../AGENTS.md)

Shared contracts: [`../backsteros-packages/contracts/`](../backsteros-packages/contracts/)
