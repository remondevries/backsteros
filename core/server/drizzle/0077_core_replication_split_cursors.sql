-- Split pull vs push watermarks so advancing the peer tip on pull cannot
-- skip local rows that still need to be pushed (and vice versa).
ALTER TABLE "core_replication_cursors"
  ADD COLUMN IF NOT EXISTS "pull_updated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "pull_row_id" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "push_updated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "push_row_id" text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE "core_replication_cursors"
SET
  "pull_updated_at" = COALESCE("pull_updated_at", "updated_at"),
  "pull_row_id" = CASE
    WHEN "pull_row_id" IS NULL OR "pull_row_id" = '' THEN "row_id"
    ELSE "pull_row_id"
  END,
  "push_updated_at" = COALESCE("push_updated_at", "updated_at"),
  "push_row_id" = CASE
    WHEN "push_row_id" IS NULL OR "push_row_id" = '' THEN "row_id"
    ELSE "push_row_id"
  END;
--> statement-breakpoint
ALTER TABLE "core_replication_cursors"
  ALTER COLUMN "pull_updated_at" SET NOT NULL,
  ALTER COLUMN "push_updated_at" SET NOT NULL;
