-- Durable BacksterOS contact link for Chatwoot conversations (Telegram / Messenger).
-- Soft-match by email/phone/username is not enough when Chatwoot visitors have none.
ALTER TABLE "chat_conversations"
  ADD COLUMN IF NOT EXISTS "contact_id" text REFERENCES "contacts"("id") ON DELETE set null;
CREATE INDEX IF NOT EXISTS "chat_conversations_contact_id_idx"
  ON "chat_conversations" ("contact_id");
