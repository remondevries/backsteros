ALTER TABLE "project_updates"
  ADD COLUMN IF NOT EXISTS "related_task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
