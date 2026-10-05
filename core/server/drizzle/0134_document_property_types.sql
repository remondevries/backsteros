CREATE TABLE IF NOT EXISTS "document_property_types" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"multiple" boolean DEFAULT false NOT NULL,
	"project_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"seeded" boolean DEFAULT false NOT NULL,
	"proposed_by_contact_id" text,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_property_types" ADD CONSTRAINT "document_property_types_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_property_types" ADD CONSTRAINT "document_property_types_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_property_types_workspace_id_idx" ON "document_property_types" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_property_types_deleted_at_idx" ON "document_property_types" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_property_types_project_id_idx" ON "document_property_types" USING btree ("project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_property_types_workspace_key_live_idx"
  ON "document_property_types" ("workspace_id", "key")
  WHERE "deleted_at" IS NULL AND "status" IN ('active', 'proposed');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_property_types_replication_tip_idx"
  ON "document_property_types" ("updated_at", "id");
