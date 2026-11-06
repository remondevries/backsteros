-- OS-169: explicit Remon reconciliation ack before retrying needs_reconciliation.
-- Persisted so reload keeps the ack; cleared whenever status returns to needs_reconciliation.

ALTER TABLE "bunq_payment_proposals"
  ADD COLUMN IF NOT EXISTS "unknown_outcome_acknowledged_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "bunq_payment_proposals"
  ADD COLUMN IF NOT EXISTS "unknown_outcome_acknowledged_by_user_id" text
    REFERENCES "users"("id") ON DELETE set null;
