-- OS-167: Ralph → Remon bunq payment proposals (approval-gated single transfers).
-- Server-only table — never PowerSync. Feature remains disabled until env gate is on.
-- bunq_idempotency_key is the official X-Bunq-Client-Idempotency-Key (UUID), tied to
-- the proposal hash for the lifetime of this payment attempt. Client idempotency_key
-- only dedupes proposal creates.

CREATE TABLE IF NOT EXISTS "bunq_payment_proposals" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "proposed_by_agent_id" text NOT NULL REFERENCES "agents"("id") ON DELETE restrict,
  "proposed_by_api_key_id" text REFERENCES "api_keys"("id") ON DELETE set null,
  "recipient_name" text NOT NULL,
  "recipient_iban" text NOT NULL,
  "amount_value" text NOT NULL,
  "amount_currency" text NOT NULL,
  "memo" text NOT NULL,
  "source_monetary_account_id" text NOT NULL,
  "proposal_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "expires_at" timestamp with time zone NOT NULL,
  "chat_thread_id" text REFERENCES "chat_threads"("id") ON DELETE set null,
  "chat_message_id" text REFERENCES "chat_thread_messages"("id") ON DELETE set null,
  "approved_by_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "approved_at" timestamp with time zone,
  "consumed_at" timestamp with time zone,
  "approved_amount_value" text,
  "bunq_payment_id" text,
  "execution_error" text,
  "payment_attempted_at" timestamp with time zone,
  "client_idempotency_key" text NOT NULL,
  "bunq_idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "bunq_payment_proposals_workspace_client_idem_uidx"
  ON "bunq_payment_proposals" ("workspace_id", "client_idempotency_key");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "bunq_payment_proposals_workspace_bunq_idem_uidx"
  ON "bunq_payment_proposals" ("workspace_id", "bunq_idempotency_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "bunq_payment_proposals_workspace_status_idx"
  ON "bunq_payment_proposals" ("workspace_id", "status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "bunq_payment_proposals_workspace_agent_idx"
  ON "bunq_payment_proposals" ("workspace_id", "proposed_by_agent_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "bunq_payment_proposals_workspace_expires_idx"
  ON "bunq_payment_proposals" ("workspace_id", "expires_at");
