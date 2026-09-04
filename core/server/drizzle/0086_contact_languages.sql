ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "languages" jsonb DEFAULT '[]'::jsonb NOT NULL;
