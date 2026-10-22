ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "follow_up_date" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "tasks_workspace_follow_up_date_idx"
  ON "tasks" ("workspace_id", "follow_up_date");
