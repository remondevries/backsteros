-- OS-188: dedupe inbound retriage across webhook + list ingest.
ALTER TABLE "email_threads"
  ADD COLUMN IF NOT EXISTS "last_processed_inbound_message_id" text;
