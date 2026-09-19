ALTER TABLE "task_labels" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "task_labels" ADD COLUMN IF NOT EXISTS "parent_id" text;
--> statement-breakpoint
ALTER TABLE "task_labels" ADD COLUMN IF NOT EXISTS "is_group" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "task_labels" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."task_labels"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_labels_parent_id_idx" ON "task_labels" USING btree ("parent_id");
