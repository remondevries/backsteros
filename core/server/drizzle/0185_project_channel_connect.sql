-- Self-service Channel connect: status + pending chat deep link + request time.
-- Webhook URL/secret for Connect live on workspace_integration_secrets
-- (and/or CHANNEL_CONNECT_WEBHOOK_* env). Never log the secret.

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "channel_status" text NOT NULL DEFAULT 'inactive';
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "channel_pending_link" text;
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "channel_requested_at" timestamptz;

UPDATE "projects"
SET "channel_status" = 'active'
WHERE "channel" IS NOT NULL
  AND "channel_status" = 'inactive';

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "channel_connect_webhook_url" text;
ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "channel_connect_webhook_secret" text;
