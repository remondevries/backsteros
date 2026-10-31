ALTER TABLE "chat_thread_messages" ADD COLUMN IF NOT EXISTS "choices" jsonb;
--> statement-breakpoint
ALTER TABLE "chat_thread_messages" ADD COLUMN IF NOT EXISTS "choices_answer" jsonb;
