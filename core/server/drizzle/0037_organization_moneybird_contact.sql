ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "moneybird_contact_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_workspace_moneybird_contact_uidx"
  ON "organizations" ("workspace_id", "moneybird_contact_id")
  WHERE "moneybird_contact_id" IS NOT NULL AND "deleted_at" IS NULL;
