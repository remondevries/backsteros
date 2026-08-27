CREATE TABLE IF NOT EXISTS "core_sync_event_replication_state" (
  "workspace_id" text PRIMARY KEY NOT NULL,
  "after_cursor" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
