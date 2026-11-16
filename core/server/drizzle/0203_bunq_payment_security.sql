-- Round 4 payment security (H2 / M2 / M4).
--
-- 1. bunq secrets are encrypted at rest IN PLACE with the same AES-256-GCM
--    helper as auto-review webhook secrets. No new ciphertext columns: the
--    existing text columns (bunq_api_key, bunq_signing_private_key_pem,
--    bunq_installation_token, bunq_session_token) hold a `v1:<iv>:<tag>:<data>`
--    value. Legacy plaintext rows keep working (read as-is) and are re-written
--    encrypted by encryptLegacyBunqSecrets() / the next write. This SQL cannot
--    encrypt because the key lives in the app env.
-- 2. Approver / rejecter attribution on proposals.
-- 3. Append-only audit trail of every state transition.
-- 4. Kill switch: bunq_payments_paused (cloud-authoritative; never replicated).

ALTER TABLE "bunq_payment_proposals"
  ADD COLUMN IF NOT EXISTS "approved_by_api_key_id" text;
--> statement-breakpoint

ALTER TABLE "bunq_payment_proposals"
  ADD COLUMN IF NOT EXISTS "rejected_by_user_id" text
    REFERENCES "users"("id") ON DELETE set null;
--> statement-breakpoint

ALTER TABLE "bunq_payment_proposals"
  ADD COLUMN IF NOT EXISTS "rejected_by_api_key_id" text;
--> statement-breakpoint

ALTER TABLE "bunq_payment_proposals"
  ADD COLUMN IF NOT EXISTS "rejected_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "bunq_payments_paused" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bunq_payment_proposal_events" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "proposal_id" text NOT NULL,
  "event_type" text NOT NULL,
  "actor_kind" text NOT NULL,
  "actor_user_id" text,
  "actor_api_key_id" text,
  "proposal_hash" text NOT NULL,
  "amount_value" text NOT NULL,
  "amount_currency" text NOT NULL,
  "status_from" text,
  "status_to" text NOT NULL,
  "detail" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "bunq_payment_proposal_events_proposal_idx"
  ON "bunq_payment_proposal_events" ("workspace_id", "proposal_id", "created_at");
--> statement-breakpoint

-- Append-only: UPDATE is never allowed; DELETE only as an FK cascade from the
-- workspace (pg_trigger_depth() > 1), never as a direct statement.
CREATE OR REPLACE FUNCTION "bunq_payment_proposal_events_append_only"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'bunq_payment_proposal_events is append-only';
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'bunq_payment_proposal_events is append-only';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "bunq_payment_proposal_events_append_only_trg"
  ON "bunq_payment_proposal_events";
--> statement-breakpoint

CREATE TRIGGER "bunq_payment_proposal_events_append_only_trg"
  BEFORE UPDATE OR DELETE ON "bunq_payment_proposal_events"
  FOR EACH ROW EXECUTE FUNCTION "bunq_payment_proposal_events_append_only"();
