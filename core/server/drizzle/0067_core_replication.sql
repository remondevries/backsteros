CREATE TABLE IF NOT EXISTS "core_replication_state" (
  "peer_id" text PRIMARY KEY NOT NULL,
  "last_pulled_at" timestamp with time zone,
  "last_pushed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "core_replication_outbox" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "table_name" text NOT NULL,
  "row_id" text NOT NULL,
  "operation" text NOT NULL,
  "payload" jsonb NOT NULL,
  "origin" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "delivered_at" timestamp with time zone
);

ALTER TABLE "core_replication_outbox"
  ADD CONSTRAINT "core_replication_outbox_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "core_replication_outbox_pending_idx"
  ON "core_replication_outbox" ("workspace_id", "created_at")
  WHERE "delivered_at" IS NULL;
