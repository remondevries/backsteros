-- Channel username for Chatwoot visitors (Telegram @handle without @).
ALTER TABLE "chat_conversations"
  ADD COLUMN IF NOT EXISTS "contact_username" text;
