ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "agentmail_api_key" text;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "agentmail_inbox_id" text;
