-- Durable BacksterOS organization link for Chatwoot conversations.
ALTER TABLE "chat_conversations"
  ADD COLUMN IF NOT EXISTS "organization_id" text REFERENCES "organizations"("id") ON DELETE set null;
CREATE INDEX IF NOT EXISTS "chat_conversations_organization_id_idx"
  ON "chat_conversations" ("organization_id");
