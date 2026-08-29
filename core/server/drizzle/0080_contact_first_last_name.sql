ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "first_name" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "last_name" text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE "contacts" SET "first_name" = "name" WHERE "first_name" IS NULL OR "first_name" = '';
--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "first_name" SET NOT NULL;
--> statement-breakpoint
UPDATE "contacts"
SET "name" = trim(both FROM ("first_name" || CASE
  WHEN coalesce(nullif(trim("last_name"), ''), '') IS NULL THEN ''
  ELSE ' ' || trim("last_name")
END));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_last_name_idx" ON "contacts" USING btree ("workspace_id","last_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_first_name_idx" ON "contacts" USING btree ("workspace_id","first_name");
