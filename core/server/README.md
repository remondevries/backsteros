# @backsteros/server

Backend for **BacksterOS** — Hono + PostgreSQL + OpenAPI.

**v2 host:** local computer (see `docs/12-v2-local-computer.md`)  
**Optional remote:** `https://service.backsteros.com`

## Quick start (local)

From the workspace root:

```bash
# 1. Start Postgres (+ PowerSync when needed)
pnpm db:up

# 2. Configure env — DATABASE_URL must target Docker Postgres (:5433), not Neon
cp core/server/.env.example core/server/.env
# Edit CLERK_SECRET_KEY when you have Clerk set up

# 3. Migrate + PowerSync publication + bootstrap API key
pnpm db:migrate
pnpm db:powersync-setup
pnpm --filter @backsteros/server db:seed
# Save the sk_live_... secret — shown once

# 4. Run API
pnpm --filter @backsteros/server dev
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

## Cursor spellcheck

Workspace Cursor API keys live in `workspace_integration_secrets` (not PowerSync).
Configure via `GET`/`PATCH /api/v1/settings/cursor` and run rewrite with
`POST /api/v1/ai/spellcheck` (uses `@cursor/sdk` on the server).

## Local vault (Obsidian-style)

Markdown bodies and letter PDFs are stored on disk under a vault root — not
DigitalOcean Spaces. Set `BACKSTEROS_VAULT_PATH` or choose a folder in desktop
**Settings → Storage** (`GET`/`PATCH /api/v1/settings/storage`).

On first configure, the API creates:

```text
Journal/
Projects/{PROJECT_KEY}/Codebase|Documents|Updates/
Letters/{YYYY}/{MM}/
Knowledge Base/
.backsteros/   # avatars / system blobs
```

Health still exposes `spacesConfigured` as “storage configured” for older clients.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Dev server (workspace root) |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm --filter @backsteros/server db:seed` | Create bootstrap API key (dev) |
| `pnpm db:powersync-setup` | Create/update `powersync` publication + grants (Tier A/B tables) |
| `pnpm db:powersync-verify` | Check publication + `powersync_role` SELECT match sync tables |
| `pnpm powersync:up` | Start PowerSync + Mongo (docker compose) |

After changing sync tables, re-run `db:powersync-setup` (or verify), then `docker restart backsteros-powersync`.

## Architecture

Specs: [`../../docs/`](../../docs/) — [`../../AGENTS.md`](../../AGENTS.md)

Shared contracts: [`../packages/contracts/`](../packages/contracts/)
