-- OS-166: bunq sandbox read-only integration credentials + connection state.
-- Secrets live in workspace_integration_secrets (never PowerSync). No values seeded.

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "bunq_api_key" text;
--> statement-breakpoint

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "bunq_signing_private_key_pem" text;
--> statement-breakpoint

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "bunq_installation_token" text;
--> statement-breakpoint

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "bunq_server_public_key_pem" text;
--> statement-breakpoint

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "bunq_session_token" text;
--> statement-breakpoint

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "bunq_session_expires_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "bunq_device_id" text;
--> statement-breakpoint

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "bunq_user_id" text;
--> statement-breakpoint

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "bunq_environment" text;
--> statement-breakpoint

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "bunq_permitted_ips" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "bunq_last_connected_at" timestamp with time zone;
