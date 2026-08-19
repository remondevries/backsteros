ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "agent_created_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "agent_inbox_approved_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_agent_inbox_pending_idx" ON "tasks" ("workspace_id", "agent_created_at", "agent_inbox_approved_at") WHERE "agent_created_at" IS NOT NULL AND "agent_inbox_approved_at" IS NULL AND "deleted_at" IS NULL;
