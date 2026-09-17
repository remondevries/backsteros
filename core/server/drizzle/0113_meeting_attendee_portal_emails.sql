ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "attendee_portal_emails" jsonb NOT NULL DEFAULT '{}'::jsonb;
