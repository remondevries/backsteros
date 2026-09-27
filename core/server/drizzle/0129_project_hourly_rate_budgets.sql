ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "hourly_rate_cents" bigint;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "budgets" jsonb NOT NULL DEFAULT '[]'::jsonb;
