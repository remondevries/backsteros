ALTER TABLE "chat_thread_messages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_thread_messages_thread_alive_created_idx"
  ON "chat_thread_messages" ("thread_id", "created_at")
  WHERE "deleted_at" IS NULL;
