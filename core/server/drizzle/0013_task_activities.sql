CREATE TABLE IF NOT EXISTS "task_activities" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "task_id" text NOT NULL,
  "type" text NOT NULL,
  "actor_user_id" text,
  "actor_email" text,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_activities_task_id_idx" ON "task_activities" ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_activities_workspace_id_idx" ON "task_activities" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_activities_created_at_idx" ON "task_activities" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_activities_type_idx" ON "task_activities" ("type");
