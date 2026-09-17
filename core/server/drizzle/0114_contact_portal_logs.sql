CREATE TABLE IF NOT EXISTS "contact_portal_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "contact_id" text NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "project_id" text REFERENCES "projects"("id") ON DELETE SET NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_portal_logs_contact_occurred_idx"
  ON "contact_portal_logs" ("workspace_id", "contact_id", "occurred_at" DESC);
