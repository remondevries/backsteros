-- Per-message org/contact links within an AgentMail thread.
ALTER TABLE "email_threads"
  ADD COLUMN IF NOT EXISTS "message_parties" jsonb
  NOT NULL DEFAULT '{}'::jsonb;
