ALTER TABLE "tasks" ADD COLUMN "inbox_updated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "inbox_updated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "inbox_updated_at" timestamp with time zone;
