-- Align project update statuses with task workflow statuses.
UPDATE "project_updates" SET "status" = CASE "status"
  WHEN 'draft' THEN 'backlog'
  WHEN 'published' THEN 'completed'
  WHEN 'investigating' THEN 'in_progress'
  WHEN 'identified' THEN 'in_progress'
  WHEN 'monitoring' THEN 'in_review'
  WHEN 'resolved' THEN 'completed'
  WHEN 'scheduled' THEN 'ready_to_start'
  ELSE "status"
END;
--> statement-breakpoint
ALTER TABLE "project_updates" ALTER COLUMN "status" SET DEFAULT 'backlog';
