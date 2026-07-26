CREATE TABLE IF NOT EXISTS "recurring_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"project_id" text,
	"inbox" boolean DEFAULT true NOT NULL,
	"cron_expression" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_task_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_tasks_workspace_id_idx" ON "recurring_tasks" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_tasks_due_idx" ON "recurring_tasks" USING btree ("enabled","next_run_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_tasks_deleted_at_idx" ON "recurring_tasks" USING btree ("deleted_at");
