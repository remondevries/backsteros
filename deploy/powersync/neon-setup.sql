-- Neon / Postgres setup for PowerSync (run once as admin).
-- Prerequisites:
--   1. Enable Logical Replication in Neon console (Settings → Logical Replication)
--   2. Replace the password below before running

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_role') THEN
    CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD 'replace-with-strong-password';
  END IF;
END
$$;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;

-- Replicate only Tier A/B tables (not api_keys, users, sync_events).
DROP PUBLICATION IF EXISTS powersync;
CREATE PUBLICATION powersync FOR TABLE projects, tasks, documents;

-- Connection string for PowerSync (store in .kamal/secrets as POWERSYNC_SOURCE_URI):
-- postgresql://powersync_role:PASSWORD@HOST/neondb?sslmode=require
