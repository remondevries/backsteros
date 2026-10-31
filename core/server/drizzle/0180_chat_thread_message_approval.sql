ALTER TABLE "chat_thread_messages" ADD COLUMN IF NOT EXISTS "approval" jsonb;

ALTER TABLE "chat_thread_messages" ADD COLUMN IF NOT EXISTS "approval_answer" jsonb;
