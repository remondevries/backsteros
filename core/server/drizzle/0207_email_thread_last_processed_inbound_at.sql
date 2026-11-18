-- OS-188 fix: time-based inbound retriage cursor (never seed-only in poll).
-- Seed last_processed_inbound_at from updated_at so existing Waiting/Done threads
-- only retriage when a newer inbound arrives after their last metadata write.
ALTER TABLE "email_threads"
  ADD COLUMN IF NOT EXISTS "last_processed_inbound_at" timestamptz;
--> statement-breakpoint
UPDATE "email_threads"
SET "last_processed_inbound_at" = "updated_at"
WHERE "last_processed_inbound_at" IS NULL;
