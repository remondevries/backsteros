ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "mapbox_access_token" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "latitude" double precision;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "longitude" double precision;
