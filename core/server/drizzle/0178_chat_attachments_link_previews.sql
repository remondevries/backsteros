CREATE TABLE IF NOT EXISTS "chat_thread_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"message_id" text,
	"storage_key" text NOT NULL,
	"original_filename" text DEFAULT '' NOT NULL,
	"content_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"checksum" text,
	"content_etag" text,
	"kind" text DEFAULT 'file' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chat_thread_attachments" ADD CONSTRAINT "chat_thread_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_thread_attachments" ADD CONSTRAINT "chat_thread_attachments_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_thread_attachments" ADD CONSTRAINT "chat_thread_attachments_message_id_chat_thread_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_thread_messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_thread_attachments_workspace_id_idx" ON "chat_thread_attachments" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_thread_attachments_thread_id_idx" ON "chat_thread_attachments" USING btree ("thread_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_thread_attachments_message_id_idx" ON "chat_thread_attachments" USING btree ("message_id");
--> statement-breakpoint
ALTER TABLE "chat_thread_messages" ADD COLUMN IF NOT EXISTS "link_previews" jsonb;
