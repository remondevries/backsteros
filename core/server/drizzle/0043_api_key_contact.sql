ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "contact_id" text;
--> statement-breakpoint
ALTER TABLE "task_comments" ADD COLUMN IF NOT EXISTS "author_contact_id" text;
--> statement-breakpoint
ALTER TABLE "task_activities" ADD COLUMN IF NOT EXISTS "actor_contact_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_contact_id_fk" FOREIGN KEY ("author_contact_id") REFERENCES "contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_actor_contact_id_fk" FOREIGN KEY ("actor_contact_id") REFERENCES "contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_contact_id_idx" ON "api_keys" ("contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_author_contact_id_idx" ON "task_comments" ("author_contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_activities_actor_contact_id_idx" ON "task_activities" ("actor_contact_id");
