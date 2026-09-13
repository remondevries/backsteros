ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "provider" text;
CREATE INDEX IF NOT EXISTS "projects_provider_idx" ON "projects" ("provider");
