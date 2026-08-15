CREATE TABLE IF NOT EXISTS "financial_recurrings" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "name" text NOT NULL,
  "icon" text,
  "category_id" text,
  "amount_cents" bigint,
  "next_date" date,
  "sort_order" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "financial_recurrings" ADD CONSTRAINT "financial_recurrings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "financial_recurrings" ADD CONSTRAINT "financial_recurrings_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_recurrings_workspace_id_idx" ON "financial_recurrings" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_recurrings_category_id_idx" ON "financial_recurrings" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_recurrings_deleted_at_idx" ON "financial_recurrings" USING btree ("deleted_at");
--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "recurring_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_recurring_id_financial_recurrings_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."financial_recurrings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_transactions_recurring_id_idx" ON "financial_transactions" USING btree ("recurring_id");
