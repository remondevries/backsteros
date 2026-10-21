-- Portal-facing contact avatar (separate from personal `avatar_*`).
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "portal_avatar_storage_key" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "portal_avatar_content_type" text;
