-- Telegram chat_id from Chatwoot bot DMs (numeric). Distinct from @username / t.me link.
ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "telegram_chat_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_workspace_telegram_chat_id_unique"
  ON "contacts" ("workspace_id", "telegram_chat_id")
  WHERE "deleted_at" IS NULL AND "telegram_chat_id" IS NOT NULL;
