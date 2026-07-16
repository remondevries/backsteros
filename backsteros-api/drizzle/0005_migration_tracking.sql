CREATE TABLE IF NOT EXISTS "migration_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  "source_fingerprint" text NOT NULL,
  "mode" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "source_inventory" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "migration_items" (
  "workspace_id" text NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  "source_fingerprint" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "run_id" text NOT NULL REFERENCES "public"."migration_runs"("id") ON DELETE cascade,
  "target_table" text,
  "target_id" text,
  "source_checksum" text,
  "target_checksum" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  CONSTRAINT "migration_items_source_pk" PRIMARY KEY("workspace_id","source_fingerprint","source_type","source_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migration_runs_workspace_started_idx" ON "migration_runs" ("workspace_id","started_at");
CREATE INDEX IF NOT EXISTS "migration_items_run_status_idx" ON "migration_items" ("run_id","status");
CREATE INDEX IF NOT EXISTS "migration_items_target_idx" ON "migration_items" ("target_table","target_id");
