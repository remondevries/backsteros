-- Project updates use Internal / Published visibility instead of task statuses.
UPDATE "project_updates" SET "status" = CASE
  WHEN "status" IN ('published', 'completed') THEN 'published'
  ELSE 'internal'
END;
--> statement-breakpoint
ALTER TABLE "project_updates" ALTER COLUMN "status" SET DEFAULT 'internal';
