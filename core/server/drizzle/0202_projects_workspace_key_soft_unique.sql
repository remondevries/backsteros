-- Soft-deleted projects kept blocking key reuse (e.g. RE5 tombstone vs a new
-- codebase project with the same key). Match contacts/orgs: unique only while live.

DROP INDEX IF EXISTS "projects_workspace_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_key_unique"
  ON "projects" ("workspace_id", "key")
  WHERE "deleted_at" IS NULL;
