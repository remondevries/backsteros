ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "birthday" date;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_birthday_idx" ON "contacts" USING btree ("workspace_id","birthday");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_relationships" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "from_contact_id" text NOT NULL,
  "to_contact_id" text NOT NULL,
  "type" text NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_relationships" ADD CONSTRAINT "contact_relationships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_relationships" ADD CONSTRAINT "contact_relationships_from_contact_id_contacts_id_fk" FOREIGN KEY ("from_contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_relationships" ADD CONSTRAINT "contact_relationships_to_contact_id_contacts_id_fk" FOREIGN KEY ("to_contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_relationships_workspace_id_idx" ON "contact_relationships" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_relationships_from_contact_id_idx" ON "contact_relationships" USING btree ("from_contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_relationships_to_contact_id_idx" ON "contact_relationships" USING btree ("to_contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_relationships_deleted_at_idx" ON "contact_relationships" USING btree ("deleted_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_groups" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "color" text,
  "icon" text,
  "sort_order" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_groups" ADD CONSTRAINT "crm_groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_groups_workspace_id_idx" ON "crm_groups" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_groups_deleted_at_idx" ON "crm_groups" USING btree ("deleted_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_group_members" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "group_id" text NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_group_members" ADD CONSTRAINT "crm_group_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_group_members" ADD CONSTRAINT "crm_group_members_group_id_crm_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."crm_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_group_members_workspace_id_idx" ON "crm_group_members" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_group_members_group_id_idx" ON "crm_group_members" USING btree ("group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_group_members_subject_idx" ON "crm_group_members" USING btree ("workspace_id","subject_type","subject_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_group_members_deleted_at_idx" ON "crm_group_members" USING btree ("deleted_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_activities" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" text NOT NULL,
  "kind" text NOT NULL,
  "body" text,
  "body_preview" text,
  "meeting_id" text,
  "occurred_at" timestamp with time zone NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_workspace_id_idx" ON "crm_activities" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_subject_idx" ON "crm_activities" USING btree ("workspace_id","subject_type","subject_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_occurred_at_idx" ON "crm_activities" USING btree ("occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_meeting_id_idx" ON "crm_activities" USING btree ("meeting_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_deleted_at_idx" ON "crm_activities" USING btree ("deleted_at");
