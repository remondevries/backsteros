CREATE TABLE IF NOT EXISTS "email_thread_notes" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "email_thread_id" text NOT NULL REFERENCES "email_threads"("id") ON DELETE cascade,
  "body" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "email_thread_notes_email_thread_id_idx"
  ON "email_thread_notes" ("email_thread_id");
CREATE INDEX IF NOT EXISTS "email_thread_notes_workspace_id_idx"
  ON "email_thread_notes" ("workspace_id");
CREATE INDEX IF NOT EXISTS "email_thread_notes_deleted_at_idx"
  ON "email_thread_notes" ("deleted_at");
