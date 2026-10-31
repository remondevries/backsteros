ALTER TABLE "chat_thread_messages" ADD COLUMN IF NOT EXISTS "email_draft" jsonb;

ALTER TABLE "chat_thread_messages" ADD COLUMN IF NOT EXISTS "email_draft_result" jsonb;
