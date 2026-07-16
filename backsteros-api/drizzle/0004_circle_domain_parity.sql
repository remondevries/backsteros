-- Additive Circle domain parity migration. New required columns have defaults;
-- existing project/task/document rows remain valid throughout deployment.
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  "number" integer,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "summary" text,
  "phone" text,
  "email" text,
  "website" text,
  "address" text,
  "city" text,
  "postal_code" text,
  "country" text,
  "avatar_storage_key" text,
  "avatar_content_type" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "areas" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "icon" text,
  "color" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  "organization_id" text REFERENCES "public"."organizations"("id") ON DELETE set null,
  "number" integer,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "email" text,
  "title" text,
  "summary" text,
  "avatar_storage_key" text,
  "avatar_content_type" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "phone" text,
  "role" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "organization_id" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "area_id" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "area" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "start_date" timestamp with time zone;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "due_date" timestamp with time zone;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "icon" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "color" text;
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null;
ALTER TABLE "projects" ADD CONSTRAINT "projects_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "contact_id" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assignee_id" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "triaged_at" timestamp with time zone;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "inbox" boolean DEFAULT false NOT NULL;
UPDATE "tasks" SET "inbox" = true WHERE "project_id" IS NULL AND "triaged_at" IS NULL;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_contacts_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."contacts"("id") ON DELETE set null;
DROP INDEX IF EXISTS "tasks_workspace_project_number_unique";
CREATE UNIQUE INDEX "tasks_workspace_scope_number_unique" ON "tasks" ("workspace_id", COALESCE('project:' || "project_id", 'contact:' || "contact_id", '__inbox__'), "number");
UPDATE "entity_counters"
SET "scope_id" = CASE
  WHEN "scope_id" = '__inbox__' THEN '__inbox__'
  ELSE 'project:' || "scope_id"
END
WHERE "entity" = 'task';
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "parent_id" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'document' NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "icon" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "journal_date" date;
ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_id_documents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."documents"("id") ON DELETE set null;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "letters" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  "number" integer,
  "project_id" text REFERENCES "public"."projects"("id") ON DELETE set null,
  "organization_id" text REFERENCES "public"."organizations"("id") ON DELETE set null,
  "contact_id" text REFERENCES "public"."contacts"("id") ON DELETE set null,
  "title" text NOT NULL,
  "icon" text,
  "context" text,
  "status" text DEFAULT 'ready_to_start' NOT NULL,
  "due_date" timestamp with time zone,
  "received_date" timestamp with time zone,
  "direction" text DEFAULT 'incoming' NOT NULL,
  "storage_key" text DEFAULT '' NOT NULL,
  "original_filename" text DEFAULT '' NOT NULL,
  "content_type" text DEFAULT 'application/pdf' NOT NULL,
  "byte_size" integer DEFAULT 0 NOT NULL,
  "checksum" text,
  "content_etag" text,
  "extracted_text" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "avatars" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "storage_key" text NOT NULL,
  "content_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "checksum" text NOT NULL,
  "content_etag" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mentions" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  "user_id" text REFERENCES "public"."users"("id") ON DELETE cascade,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "excerpt" text,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_workspace_id_idx" ON "organizations" ("workspace_id");
CREATE INDEX IF NOT EXISTS "organizations_workspace_key_idx" ON "organizations" ("workspace_id", "key");
CREATE INDEX IF NOT EXISTS "organizations_workspace_number_idx" ON "organizations" ("workspace_id", "number");
CREATE INDEX IF NOT EXISTS "contacts_workspace_id_idx" ON "contacts" ("workspace_id");
CREATE INDEX IF NOT EXISTS "contacts_workspace_key_idx" ON "contacts" ("workspace_id", "key");
CREATE INDEX IF NOT EXISTS "contacts_workspace_number_idx" ON "contacts" ("workspace_id", "number");
CREATE INDEX IF NOT EXISTS "contacts_organization_id_idx" ON "contacts" ("organization_id");
CREATE INDEX IF NOT EXISTS "contacts_email_idx" ON "contacts" ("workspace_id", "email");
CREATE INDEX IF NOT EXISTS "areas_workspace_id_idx" ON "areas" ("workspace_id");
CREATE INDEX IF NOT EXISTS "projects_organization_id_idx" ON "projects" ("organization_id");
CREATE INDEX IF NOT EXISTS "projects_area_id_idx" ON "projects" ("area_id");
CREATE INDEX IF NOT EXISTS "tasks_contact_id_idx" ON "tasks" ("contact_id");
CREATE INDEX IF NOT EXISTS "tasks_assignee_id_idx" ON "tasks" ("assignee_id");
CREATE INDEX IF NOT EXISTS "tasks_workspace_due_date_idx" ON "tasks" ("workspace_id", "due_date");
CREATE INDEX IF NOT EXISTS "documents_parent_id_idx" ON "documents" ("parent_id");
CREATE INDEX IF NOT EXISTS "documents_workspace_journal_date_idx" ON "documents" ("workspace_id", "journal_date");
CREATE INDEX IF NOT EXISTS "letters_workspace_id_idx" ON "letters" ("workspace_id");
CREATE INDEX IF NOT EXISTS "letters_workspace_number_idx" ON "letters" ("workspace_id", "number");
CREATE INDEX IF NOT EXISTS "letters_project_id_idx" ON "letters" ("project_id");
CREATE INDEX IF NOT EXISTS "letters_status_idx" ON "letters" ("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "letters_organization_id_idx" ON "letters" ("organization_id");
CREATE INDEX IF NOT EXISTS "letters_contact_id_idx" ON "letters" ("contact_id");
CREATE INDEX IF NOT EXISTS "letters_received_date_idx" ON "letters" ("workspace_id", "received_date");
CREATE UNIQUE INDEX IF NOT EXISTS "avatars_workspace_entity_unique" ON "avatars" ("workspace_id", "entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "avatars_workspace_id_idx" ON "avatars" ("workspace_id");
CREATE INDEX IF NOT EXISTS "mentions_workspace_user_idx" ON "mentions" ("workspace_id", "user_id");
CREATE INDEX IF NOT EXISTS "mentions_source_idx" ON "mentions" ("workspace_id", "source_type", "source_id");
