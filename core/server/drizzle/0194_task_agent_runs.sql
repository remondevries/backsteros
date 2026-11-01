-- Task agent factory runs (Brief → Build → Verify → Record → Ship).
-- Grok conductor advances phases via API; desktop executes local Cursor ACP.

CREATE TABLE IF NOT EXISTS "task_agent_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "task_id" text NOT NULL REFERENCES "tasks"("id") ON DELETE cascade,
  "project_id" text REFERENCES "projects"("id") ON DELETE set null,
  "conductor_agent_id" text NOT NULL REFERENCES "agents"("id") ON DELETE restrict,
  "conductor_contact_id" text REFERENCES "contacts"("id") ON DELETE set null,
  "phase" text DEFAULT 'brief' NOT NULL,
  "cycle" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "brief_thread_id" text REFERENCES "chat_threads"("id") ON DELETE set null,
  "builder_session_id" text,
  "build_prompt" text,
  "record_intent" text,
  "record_notes" text,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "task_agent_runs_workspace_id_idx"
  ON "task_agent_runs" ("workspace_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "task_agent_runs_task_id_idx"
  ON "task_agent_runs" ("task_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "task_agent_runs_task_status_idx"
  ON "task_agent_runs" ("task_id", "status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "task_agent_runs_conductor_agent_id_idx"
  ON "task_agent_runs" ("conductor_agent_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "task_agent_run_checks" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "run_id" text NOT NULL REFERENCES "task_agent_runs"("id") ON DELETE cascade,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "detail" text,
  "log_text" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "task_agent_run_checks_run_id_idx"
  ON "task_agent_run_checks" ("run_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "task_agent_run_checks_workspace_id_idx"
  ON "task_agent_run_checks" ("workspace_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "task_agent_run_checks_run_key_uidx"
  ON "task_agent_run_checks" ("run_id", "key");
