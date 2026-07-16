-- Circle permits duplicate task numbers in a scope. Preserve those imported
-- rows while retaining scoped uniqueness for all newly-created BacksterOS rows.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "legacy_source" text;
UPDATE "tasks" t
SET "legacy_source" = 'circle'
WHERE EXISTS (
  SELECT 1
  FROM "migration_items" mi
  WHERE mi."target_table" = 'tasks'
    AND mi."target_id" = t."id"
    AND mi."source_type" = 'task'
);
DROP INDEX IF EXISTS "tasks_workspace_scope_number_unique";
CREATE UNIQUE INDEX "tasks_workspace_scope_number_unique"
  ON "tasks" ("workspace_id", COALESCE('project:' || "project_id", 'contact:' || "contact_id", '__inbox__'), "number")
  WHERE "legacy_source" IS NULL;
CREATE INDEX IF NOT EXISTS "tasks_workspace_scope_number_idx"
  ON "tasks" ("workspace_id", COALESCE('project:' || "project_id", 'contact:' || "contact_id", '__inbox__'), "number");
