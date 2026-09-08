CREATE TABLE IF NOT EXISTS "task_agent_presence" (
  "task_id" text PRIMARY KEY NOT NULL REFERENCES "tasks"("id") ON DELETE cascade,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "source" text DEFAULT 'unknown' NOT NULL,
  "session_id" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "task_agent_presence_workspace_id_idx"
  ON "task_agent_presence" ("workspace_id");

CREATE INDEX IF NOT EXISTS "task_agent_presence_workspace_heartbeat_idx"
  ON "task_agent_presence" ("workspace_id", "last_heartbeat_at");
