ALTER TABLE "task_comments" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_resolved_at_idx"
  ON "task_comments" ("resolved_at");
