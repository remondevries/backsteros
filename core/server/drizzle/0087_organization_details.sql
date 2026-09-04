ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "size" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "social_accounts" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "region" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "latitude" double precision;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "longitude" double precision;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "chamber_of_commerce" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "tax_number" text;
