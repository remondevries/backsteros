ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'general' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_type_idx" ON "projects" ("type");
