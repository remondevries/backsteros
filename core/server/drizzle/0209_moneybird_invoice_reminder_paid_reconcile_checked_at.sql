-- Fair rotation for paid-reconcile GETs: oldest / never-checked first.

ALTER TABLE "moneybird_invoice_reminder_tracks"
  ADD COLUMN IF NOT EXISTS "paid_reconcile_checked_at" timestamp with time zone;
