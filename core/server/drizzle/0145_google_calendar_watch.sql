ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "google_calendar_watch_channels" jsonb DEFAULT '[]'::jsonb NOT NULL;
