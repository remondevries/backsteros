# PowerSync deployment

Self-hosted PowerSync for BacksterOS offline sync on the **local computer**.

## Local development

Included in root `docker-compose.yml`:

```bash
pnpm db:up          # Postgres (wal_level=logical) + Mongo (replSet rs0) + PowerSync on :8080
pnpm db:migrate
pnpm db:powersync-setup
pnpm db:powersync-verify   # publication + grants match Tier A/B tables
```

Config: `service.local.yaml`, `sync-config.yaml`. Local Mongo runs as a single-node replica set (`--replSet rs0`) — required for PowerSync bucket-storage transactions.

After adding sync tables: update `sync-config.yaml` + `POWERSYNC_PUBLICATION_TABLES` in `core/server/src/db/powersync-tables.ts`, run `db:powersync-setup`, restart PowerSync.

## Sync rules

Tier A/B metadata only (no PDF bytes / markdown bodies):

`projects`, `tasks`, `documents`, `organizations`, `contacts`, `areas`, `letters`, `avatars`, `mentions`, `workspace_settings`, `bank_accounts`, `financial_categories`, `financial_goals`, `financial_recurrings`, `habits`, `meetings`, `task_comments`, `task_activities`, CRM tables

(Not synced: `financial_transactions` — Tier C.)

See `sync-config.yaml` and `pnpm db:powersync-verify`.
