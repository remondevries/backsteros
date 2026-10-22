-- Local ops properties for Chatwoot-mirrored conversations (assignee / priority / due).
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "assignee_id" text REFERENCES "contacts"("id") ON DELETE set null;
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "priority" integer NOT NULL DEFAULT 0;
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "due_date" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "chat_conversations_assignee_id_idx"
  ON "chat_conversations" ("assignee_id");
CREATE INDEX IF NOT EXISTS "chat_conversations_workspace_due_date_idx"
  ON "chat_conversations" ("workspace_id", "due_date");
