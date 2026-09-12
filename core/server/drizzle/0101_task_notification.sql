ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "notification" boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS "tasks_workspace_notification_idx" ON "tasks" ("workspace_id", "notification") WHERE "notification" = true AND "deleted_at" IS NULL;
