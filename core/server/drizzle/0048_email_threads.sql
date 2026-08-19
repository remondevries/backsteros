CREATE TABLE IF NOT EXISTS "email_threads" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "inbox_id" text NOT NULL,
  "thread_key" text NOT NULL,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE SET NULL,
  "contact_id" text REFERENCES "contacts"("id") ON DELETE SET NULL,
  "assignee_id" text REFERENCES "contacts"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'triage',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_threads_workspace_inbox_thread_key_idx"
  ON "email_threads" ("workspace_id", "inbox_id", "thread_key");

CREATE INDEX IF NOT EXISTS "email_threads_workspace_id_idx"
  ON "email_threads" ("workspace_id");

CREATE INDEX IF NOT EXISTS "email_threads_organization_id_idx"
  ON "email_threads" ("organization_id");

CREATE INDEX IF NOT EXISTS "email_threads_contact_id_idx"
  ON "email_threads" ("contact_id");

CREATE INDEX IF NOT EXISTS "email_threads_assignee_id_idx"
  ON "email_threads" ("assignee_id");
