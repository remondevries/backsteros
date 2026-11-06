-- Persist AgentMail message/inbox ids for portal invoice + reminder sends.

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "portal_invoice_sent_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "portal_invoice_message_id" text;
--> statement-breakpoint

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "portal_invoice_inbox_id" text;
--> statement-breakpoint

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "reminder_message_id_1" text;
--> statement-breakpoint

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "reminder_inbox_id_1" text;
--> statement-breakpoint

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "reminder_message_id_2" text;
--> statement-breakpoint

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "reminder_inbox_id_2" text;
--> statement-breakpoint

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "reminder_message_id_3" text;
--> statement-breakpoint

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "reminder_inbox_id_3" text;
