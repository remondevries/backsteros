ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "related_contact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
