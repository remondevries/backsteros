-- Page-Scoped Messenger ID from Chatwoot Facebook page chats (not a public username).
ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "facebook_messenger_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_workspace_facebook_messenger_id_unique"
  ON "contacts" ("workspace_id", "facebook_messenger_id")
  WHERE "deleted_at" IS NULL AND "facebook_messenger_id" IS NOT NULL;
