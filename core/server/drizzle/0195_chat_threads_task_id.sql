-- Task Brief threads: one conversation per task, separate from shell DMs
-- and project rooms. DM unique index must ignore rows with task_id set.

ALTER TABLE "chat_threads"
  ADD COLUMN IF NOT EXISTS "task_id" text
  REFERENCES "tasks"("id") ON DELETE CASCADE;
--> statement-breakpoint
DROP INDEX IF EXISTS "chat_threads_workspace_agent_dm_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_threads_workspace_agent_dm_uidx"
  ON "chat_threads" ("workspace_id", "agent_id")
  WHERE "project_id" IS NULL AND "task_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_threads_workspace_task_brief_uidx"
  ON "chat_threads" ("workspace_id", "task_id")
  WHERE "task_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_threads_task_id_idx"
  ON "chat_threads" ("task_id");
