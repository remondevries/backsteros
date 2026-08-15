ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "moneybird_api_token" text;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "moneybird_administration_id" text;
