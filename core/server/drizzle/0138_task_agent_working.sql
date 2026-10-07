-- OS-96: durable agent-working marker for non-coding (agents API) tasks.
-- Orthogonal to agent_chat_id (Cursor/Development session binding) and to
-- ephemeral task_agent_presence heartbeats.

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "agent_working_contact_id" text
    REFERENCES "contacts"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "agent_working_started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "agent_working_label" text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tasks_agent_working_contact_id_idx"
  ON "tasks" ("agent_working_contact_id")
  WHERE "agent_working_contact_id" IS NOT NULL AND "deleted_at" IS NULL;
