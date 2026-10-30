ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_workspace_sort_order_idx"
  ON "agents" ("workspace_id", "sort_order");
