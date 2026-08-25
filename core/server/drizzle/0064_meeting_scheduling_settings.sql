CREATE TABLE IF NOT EXISTS "meeting_scheduling_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "label" text NOT NULL DEFAULT 'Book a meeting',
  "timezone" text NOT NULL DEFAULT 'Europe/Amsterdam',
  "working_hours" jsonb NOT NULL DEFAULT '{"weekdays":[1,2,3,4,5],"start":"09:00","end":"17:00"}'::jsonb,
  "durations_minutes" jsonb NOT NULL DEFAULT '[30,60]'::jsonb,
  "min_notice_minutes" integer NOT NULL DEFAULT 120,
  "buffer_minutes" integer NOT NULL DEFAULT 15,
  "horizon_days" integer NOT NULL DEFAULT 28,
  "default_project_id" text,
  "default_organization_id" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "meeting_scheduling_settings"
  ADD CONSTRAINT "meeting_scheduling_settings_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "meeting_scheduling_settings"
  ADD CONSTRAINT "meeting_scheduling_settings_default_project_id_projects_id_fk"
  FOREIGN KEY ("default_project_id") REFERENCES "public"."projects"("id")
  ON DELETE set null ON UPDATE no action;

ALTER TABLE "meeting_scheduling_settings"
  ADD CONSTRAINT "meeting_scheduling_settings_default_organization_id_organizations_id_fk"
  FOREIGN KEY ("default_organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE set null ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "meeting_scheduling_settings_workspace_id_uidx"
  ON "meeting_scheduling_settings" ("workspace_id");

INSERT INTO "meeting_scheduling_settings" (
  "id",
  "workspace_id",
  "label",
  "timezone",
  "working_hours",
  "durations_minutes",
  "min_notice_minutes",
  "buffer_minutes",
  "horizon_days",
  "enabled"
)
SELECT
  'scheduling-' || w."id",
  w."id",
  'Book a meeting',
  'Europe/Amsterdam',
  '{"weekdays":[1,2,3,4,5],"start":"09:00","end":"17:00"}'::jsonb,
  '[30,60]'::jsonb,
  120,
  15,
  28,
  true
FROM "workspaces" w
WHERE NOT EXISTS (
  SELECT 1 FROM "meeting_scheduling_settings" s WHERE s."workspace_id" = w."id"
);
