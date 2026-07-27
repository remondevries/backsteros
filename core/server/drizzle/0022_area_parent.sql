ALTER TABLE "areas" ADD COLUMN IF NOT EXISTS "parent" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "areas_workspace_parent_idx" ON "areas" ("workspace_id", "parent");
