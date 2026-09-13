ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "category" text;
CREATE INDEX IF NOT EXISTS "projects_category_idx" ON "projects" ("category");
