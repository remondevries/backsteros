-- Brandfetch as a workspace integration (Mapbox / GitHub pattern).
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "brandfetch_api_key" text;
