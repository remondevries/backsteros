-- OS-187 fix: email timeline dedupe is per ticket and includes soft-deleted rows
-- so a deleted entry is not recreated on the next sync. Deterministic ids are
-- derived in app code from workspace + task + message id.

DROP INDEX IF EXISTS "task_comments_workspace_email_message_uidx";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "task_comments_workspace_task_email_message_uidx"
  ON "task_comments" ("workspace_id", "task_id", "email_message_id")
  WHERE "email_message_id" IS NOT NULL;
