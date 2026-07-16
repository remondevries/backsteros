# PowerSync deployment

Self-hosted PowerSync for BacksterOS offline sync.

## Local development

Included in root `docker-compose.yml`:

```bash
pnpm db:up          # Postgres (wal_level=logical) + Mongo + PowerSync on :8080
pnpm db:migrate
pnpm db:powersync-setup
```

Config: `service.local.yaml`, `sync-config.yaml`

## Production (Neon + droplet)

1. **Neon** — enable Logical Replication in console, then run `neon-setup.sql`
2. **Secrets** — add to `.kamal/secrets`:
   - `POWERSYNC_SOURCE_URI` — `postgresql://powersync_role:PASSWORD@...neon.../neondb?sslmode=require`
   - `POWERSYNC_JWT_SECRET` — shared HS256 secret (same as API)
   - Set `POWERSYNC_JWT_K` in `service.prod.yaml` to base64url of the secret
3. **Droplet** — run MongoDB for bucket storage, PowerSync service on `:8080`
4. **DNS** — `sync.backsteros.com` → nginx → `127.0.0.1:8080`
5. **API** — `kamal deploy` picks up `POWERSYNC_URL` + `POWERSYNC_JWT_SECRET`

## Sync rules

Tier A/B only: `projects`, `tasks`, `documents` metadata (no blob bodies).

See `sync-config.yaml`.
