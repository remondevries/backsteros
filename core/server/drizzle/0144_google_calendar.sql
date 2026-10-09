ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "google_calendar_client_id" text;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "google_calendar_client_secret" text;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "google_calendar_refresh_token" text;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "google_calendar_access_token" text;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "google_calendar_access_token_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "google_calendar_account_email" text;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "google_calendar_selected_calendar_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "google_calendar_last_synced_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "external_calendar_events" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "calendar_id" text NOT NULL,
  "external_id" text NOT NULL,
  "ical_uid" text,
  "title" text NOT NULL,
  "description" text,
  "location" text,
  "status" text,
  "html_link" text,
  "start_at" timestamp with time zone,
  "end_at" timestamp with time zone,
  "all_day" boolean DEFAULT false NOT NULL,
  "start_date" text,
  "end_date" text,
  "etag" text,
  "raw" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_calendar_events_workspace_id_idx"
  ON "external_calendar_events" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_calendar_events_workspace_start_at_idx"
  ON "external_calendar_events" ("workspace_id", "start_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_calendar_events_workspace_provider_cal_ext_uidx"
  ON "external_calendar_events" ("workspace_id", "provider", "calendar_id", "external_id");
