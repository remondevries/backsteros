ALTER TABLE "task_images" ADD COLUMN IF NOT EXISTS "comment_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_images" ADD CONSTRAINT "task_images_comment_id_task_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."task_comments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_images_comment_id_idx" ON "task_images" ("comment_id");
