-- Numeric X user id for Chatwoot API / Grok Bot encrypted DM relay (never @handle).
ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "x_user_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_workspace_x_user_id_unique"
  ON "contacts" ("workspace_id", "x_user_id")
  WHERE "deleted_at" IS NULL AND "x_user_id" IS NOT NULL;
