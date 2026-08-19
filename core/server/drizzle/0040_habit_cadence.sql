ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "cadence" text DEFAULT 'daily' NOT NULL;
--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "cadence_anchor_ymd" text;
--> statement-breakpoint
UPDATE "habits"
SET "cadence_anchor_ymd" = to_char("created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
WHERE "cadence_anchor_ymd" IS NULL;
--> statement-breakpoint
ALTER TABLE "habits" ALTER COLUMN "cadence_anchor_ymd" SET NOT NULL;
