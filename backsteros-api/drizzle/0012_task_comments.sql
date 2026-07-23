CREATE TABLE IF NOT EXISTS "task_comments" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "task_id" text NOT NULL,
  "author_user_id" text,
  "author_email" text,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_task_id_idx" ON "task_comments" ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_workspace_id_idx" ON "task_comments" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_created_at_idx" ON "task_comments" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_deleted_at_idx" ON "task_comments" ("deleted_at");
