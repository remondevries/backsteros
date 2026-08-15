CREATE TABLE IF NOT EXISTS "financial_goals" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "name" text NOT NULL,
  "listing" text DEFAULT 'active' NOT NULL,
  "icon" text,
  "goal_amount_cents" bigint,
  "start_date" date,
  "contribution_cents" bigint,
  "saving_mode" text DEFAULT 'monthly' NOT NULL,
  "sort_order" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_goals_workspace_id_idx" ON "financial_goals" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_goals_deleted_at_idx" ON "financial_goals" USING btree ("deleted_at");
