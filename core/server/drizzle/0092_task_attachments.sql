CREATE TABLE IF NOT EXISTS "task_attachments" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "task_id" text NOT NULL REFERENCES "tasks"("id") ON DELETE cascade,
  "storage_key" text NOT NULL,
  "original_filename" text NOT NULL DEFAULT '',
  "content_type" text NOT NULL DEFAULT 'application/pdf',
  "byte_size" integer NOT NULL DEFAULT 0,
  "checksum" text,
  "content_etag" text,
  "sort_order" bigint NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_attachments_workspace_id_idx" ON "task_attachments" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_attachments_task_id_idx" ON "task_attachments" ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_attachments_task_sort_idx" ON "task_attachments" ("task_id", "sort_order");
