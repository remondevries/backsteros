CREATE TABLE IF NOT EXISTS "workspace_integration_secrets" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"cursor_api_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_integration_secrets" ADD CONSTRAINT "workspace_integration_secrets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
