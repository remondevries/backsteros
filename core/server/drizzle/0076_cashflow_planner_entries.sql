CREATE TABLE IF NOT EXISTS "cashflow_planner_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "entry_type" text DEFAULT 'expense' NOT NULL,
  "name" text NOT NULL,
  "amount_cents" bigint DEFAULT 0 NOT NULL,
  "due_date" date NOT NULL,
  "group_label" text,
  "sort_order" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cashflow_planner_entries" ADD CONSTRAINT "cashflow_planner_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cashflow_planner_entries_workspace_id_idx" ON "cashflow_planner_entries" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cashflow_planner_entries_deleted_at_idx" ON "cashflow_planner_entries" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cashflow_planner_entries_due_date_idx" ON "cashflow_planner_entries" USING btree ("due_date");
