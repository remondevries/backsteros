ALTER TABLE "email_threads"
  ADD COLUMN IF NOT EXISTS "project_id" text REFERENCES "projects"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "email_threads_project_id_idx"
  ON "email_threads" ("project_id");
