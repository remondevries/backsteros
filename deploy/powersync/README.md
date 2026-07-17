# PowerSync deployment

Self-hosted PowerSync for BacksterOS offline sync.

## Local development

Included in root `docker-compose.yml`:

```bash
pnpm db:up          # Postgres (wal_level=logical) + Mongo (replSet rs0) + PowerSync on :8080
pnpm db:migrate
pnpm db:powersync-setup
```

Config: `service.local.yaml`, `sync-config.yaml`. Local Mongo runs as a single-node replica set (`--replSet rs0`) — required for PowerSync bucket-storage transactions.

## Production (Neon + droplet)

1. **Neon** — enable **Logical Replication** in console (Settings → Logical Replication), then run `neon-setup.sql`. PowerSync will fail replication until `wal_level=logical`.
2. **Secrets** — add to `.kamal/secrets`:
   - `POWERSYNC_SOURCE_URI` — `postgresql://powersync_role:PASSWORD@...neon.../neondb?sslmode=require`
   - `POWERSYNC_JWT_SECRET` — shared HS256 secret (same as API)
   - Base64url-encode the secret for the container env `PS_JWT_K` (PowerSync v1.23+ only allows `PS_*` substitution vars).
3. **Droplet** — Docker network `backsteros-powersync`:
   - **Mongo** — `mongo:7` with `--replSet rs0` (required for bucket storage transactions). Hostname: `backsteros-powersync-mongo`.
   - **PowerSync** — `journeyapps/powersync-service:latest` on `127.0.0.1:8083`, env `PS_DATA_SOURCE_URI` + `PS_JWT_K`, config from `service.prod.yaml`.
4. **DNS** — `sync.backsteros.com` A → droplet; nginx site `deploy/nginx/sync.backsteros.com.conf` → `127.0.0.1:8083`, then certbot.
5. **API** — `kamal deploy` picks up `POWERSYNC_URL` + `POWERSYNC_JWT_SECRET`.

## Sync rules

Tier A/B only: `projects`, `tasks`, `documents` metadata (no blob bodies).

See `sync-config.yaml`.
