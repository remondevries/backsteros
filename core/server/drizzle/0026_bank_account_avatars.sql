ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "avatar_storage_key" text;
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "avatar_content_type" text;
