ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'ready_to_start';
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "project_id" text;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "organization_id" text;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "attendee_contact_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
