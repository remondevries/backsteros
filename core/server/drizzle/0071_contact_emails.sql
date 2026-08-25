ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "emails" jsonb DEFAULT '[]'::jsonb NOT NULL;
