ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "related_organization_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
