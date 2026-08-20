ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "agentmail_webhook_id" text,
  ADD COLUMN IF NOT EXISTS "agentmail_webhook_secret" text,
  ADD COLUMN IF NOT EXISTS "agentmail_webhook_url" text;
