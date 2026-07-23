ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" text;
--> statement-breakpoint
ALTER TABLE "task_activities" ADD COLUMN IF NOT EXISTS "actor_name" text;
