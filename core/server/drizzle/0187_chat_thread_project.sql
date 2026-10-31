-- Project chat rooms: one thread per project (nullable project_id).
-- DM threads keep project_id NULL with unique (workspace_id, agent_id).

ALTER TABLE "chat_threads"
  ADD COLUMN IF NOT EXISTS "project_id" text
  REFERENCES "projects"("id") ON DELETE CASCADE;
--> statement-breakpoint
DROP INDEX IF EXISTS "chat_threads_workspace_agent_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_threads_workspace_agent_dm_uidx"
  ON "chat_threads" ("workspace_id", "agent_id")
  WHERE "project_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_threads_workspace_project_uidx"
  ON "chat_threads" ("workspace_id", "project_id")
  WHERE "project_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_threads_project_id_idx"
  ON "chat_threads" ("project_id");
