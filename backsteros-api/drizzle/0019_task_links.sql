ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "links" jsonb NOT NULL DEFAULT '[]'::jsonb;
