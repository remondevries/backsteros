ALTER TABLE "task_comments" ADD COLUMN IF NOT EXISTS "parent_comment_id" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "task_comments"
    ADD CONSTRAINT "task_comments_parent_comment_id_fk"
    FOREIGN KEY ("parent_comment_id")
    REFERENCES "public"."task_comments"("id")
    ON DELETE cascade
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_parent_comment_id_idx"
  ON "task_comments" ("parent_comment_id");
