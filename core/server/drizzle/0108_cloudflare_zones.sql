ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "cloudflare_api_token" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "cloudflare_zone_id" text;
CREATE INDEX IF NOT EXISTS "projects_cloudflare_zone_id_idx" ON "projects" ("cloudflare_zone_id");
