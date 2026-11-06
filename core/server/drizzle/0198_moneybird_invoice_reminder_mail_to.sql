-- Persist recipient email ("to") for portal invoice + reminder activity labels.

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "portal_invoice_to" text;
--> statement-breakpoint

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "reminder_to_1" text;
--> statement-breakpoint

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "reminder_to_2" text;
--> statement-breakpoint

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "reminder_to_3" text;
