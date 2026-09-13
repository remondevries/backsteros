ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "transip_login" text;
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "transip_private_key" text;
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "transip_access_token_expires_at" timestamp with time zone;
