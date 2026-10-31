ALTER TABLE "chat_thread_messages" ADD COLUMN IF NOT EXISTS "form" jsonb;

ALTER TABLE "chat_thread_messages" ADD COLUMN IF NOT EXISTS "form_answer" jsonb;
