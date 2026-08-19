ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "agentmail_inbox_contacts" jsonb NOT NULL DEFAULT '{}'::jsonb;
