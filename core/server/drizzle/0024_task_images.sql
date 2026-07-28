CREATE TABLE IF NOT EXISTS "task_images" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "task_id" text NOT NULL REFERENCES "tasks"("id") ON DELETE cascade,
  "storage_key" text NOT NULL,
  "original_filename" text NOT NULL DEFAULT '',
  "content_type" text NOT NULL,
  "byte_size" integer NOT NULL DEFAULT 0,
  "checksum" text,
  "content_etag" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_images_workspace_id_idx" ON "task_images" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_images_task_id_idx" ON "task_images" ("task_id");
