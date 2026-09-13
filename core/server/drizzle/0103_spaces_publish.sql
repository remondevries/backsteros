ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "publish_status" text DEFAULT 'concept' NOT NULL;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "publish_slug" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "seo_title" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "seo_description" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "audience" text DEFAULT 'group' NOT NULL;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "contact_ids" text[];
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "placement_folder_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_workspace_publish_status_idx" ON "documents" ("workspace_id","publish_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_workspace_publish_slug_idx" ON "documents" ("workspace_id","publish_slug");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "space_publish_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"space_document_id" text NOT NULL,
	"public_base_url" text,
	"allowed_domains" text[] DEFAULT '{}' NOT NULL,
	"site_key_prefix" text,
	"site_key_hash" text,
	"site_key_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "space_publish_settings" ADD CONSTRAINT "space_publish_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "space_publish_settings" ADD CONSTRAINT "space_publish_settings_space_document_id_documents_id_fk" FOREIGN KEY ("space_document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "space_publish_settings_workspace_space_uidx" ON "space_publish_settings" ("workspace_id","space_document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_publish_settings_workspace_id_idx" ON "space_publish_settings" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_publish_settings_site_key_prefix_idx" ON "space_publish_settings" ("site_key_prefix");
