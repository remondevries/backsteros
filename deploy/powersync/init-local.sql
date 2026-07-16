-- Local docker Postgres: PowerSync replication role (tables added after migrations).
CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD 'powersync';
GRANT CONNECT ON DATABASE backsteros TO powersync_role;
GRANT USAGE ON SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;
