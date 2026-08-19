ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "agentmail_reply_greeting_template" text;

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "agentmail_reply_sign_off_template" text;

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "agentmail_reply_sign_off_name" text;
