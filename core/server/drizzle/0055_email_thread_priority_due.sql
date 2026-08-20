ALTER TABLE "email_threads"
  ADD COLUMN IF NOT EXISTS "priority" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "due_date" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "email_threads_workspace_due_date_idx"
  ON "email_threads" ("workspace_id", "due_date");
