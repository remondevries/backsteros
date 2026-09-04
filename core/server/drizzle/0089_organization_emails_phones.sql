ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "emails" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "phones" jsonb DEFAULT '[]'::jsonb NOT NULL;
