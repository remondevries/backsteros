ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "linked_email_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
