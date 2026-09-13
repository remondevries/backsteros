ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "cover_storage_key" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "cover_content_type" text;
