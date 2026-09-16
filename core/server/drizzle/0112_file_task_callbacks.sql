CREATE TABLE IF NOT EXISTS "file_task_callbacks" (
  "request_id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "result" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "file_task_callbacks_workspace_id_idx"
  ON "file_task_callbacks" ("workspace_id");

CREATE INDEX IF NOT EXISTS "file_task_callbacks_expires_at_idx"
  ON "file_task_callbacks" ("expires_at");
