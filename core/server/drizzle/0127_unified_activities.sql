-- Unify comments into task_activities (type = 'comment') so one filterable
-- stream powers task, project, portal, and future mobile feeds.
ALTER TABLE "task_activities" ADD COLUMN IF NOT EXISTS "body" text;
--> statement-breakpoint
ALTER TABLE "task_activities" ADD COLUMN IF NOT EXISTS "parent_id" text;
--> statement-breakpoint
ALTER TABLE "task_activities" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "task_activities" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "task_activities" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
-- Backfill timestamps for existing event rows (created_at is the source of truth).
UPDATE "task_activities"
SET "updated_at" = "created_at"
WHERE "updated_at" IS DISTINCT FROM "created_at"
  AND "type" IS DISTINCT FROM 'comment';
--> statement-breakpoint
-- Copy existing comments into the unified table (same ids so dual-write / sync stay aligned).
INSERT INTO "task_activities" (
  "id",
  "workspace_id",
  "task_id",
  "type",
  "actor_user_id",
  "actor_contact_id",
  "actor_email",
  "actor_name",
  "data",
  "body",
  "parent_id",
  "resolved_at",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  c."id",
  c."workspace_id",
  c."task_id",
  'comment',
  c."author_user_id",
  c."author_contact_id",
  c."author_email",
  NULL,
  '{}'::jsonb,
  c."body",
  c."parent_comment_id",
  c."resolved_at",
  c."created_at",
  c."updated_at",
  c."deleted_at"
FROM "task_comments" c
ON CONFLICT ("id") DO UPDATE SET
  "type" = 'comment',
  "actor_user_id" = EXCLUDED."actor_user_id",
  "actor_contact_id" = EXCLUDED."actor_contact_id",
  "actor_email" = EXCLUDED."actor_email",
  "body" = EXCLUDED."body",
  "parent_id" = EXCLUDED."parent_id",
  "resolved_at" = EXCLUDED."resolved_at",
  "updated_at" = EXCLUDED."updated_at",
  "deleted_at" = EXCLUDED."deleted_at";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_activities_parent_id_idx" ON "task_activities" ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_activities_deleted_at_idx" ON "task_activities" ("deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_activities_task_type_created_idx" ON "task_activities" ("task_id", "type", "created_at");
