ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "city" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "postal_code" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "country" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "social_accounts" jsonb NOT NULL DEFAULT '[]'::jsonb;
