ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "portal_username" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "portal_password_hash" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "portal_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_workspace_portal_username_unique"
  ON "contacts" ("workspace_id", "portal_username")
  WHERE "deleted_at" IS NULL AND "portal_username" IS NOT NULL;
