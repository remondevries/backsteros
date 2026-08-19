ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "project_id" text;
--> statement-breakpoint
UPDATE "habits" AS h
SET "project_id" = p."id"
FROM "projects" AS p
WHERE h."project_id" IS NULL
  AND p."workspace_id" = h."workspace_id"
  AND lower(p."name") = 'health'
  AND p."deleted_at" IS NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "habits" ADD CONSTRAINT "habits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habits_project_id_idx" ON "habits" USING btree ("project_id");
