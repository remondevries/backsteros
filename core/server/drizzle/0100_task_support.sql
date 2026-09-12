ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "support" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_workspace_support_idx" ON "tasks" ("workspace_id", "support") WHERE "support" = true AND "deleted_at" IS NULL;
