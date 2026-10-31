-- OS-162 / audit #8: GIN indexes for task JSONB containment filters (@>).
-- jsonb_path_ops is smaller/faster for containment-only queries.
-- Safe on both cores (IF NOT EXISTS). Reversible via the down block below.

CREATE INDEX IF NOT EXISTS "tasks_related_contact_ids_gin_idx"
  ON "tasks" USING gin ("related_contact_ids" jsonb_path_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_related_organization_ids_gin_idx"
  ON "tasks" USING gin ("related_organization_ids" jsonb_path_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_linked_email_ids_gin_idx"
  ON "tasks" USING gin ("linked_email_ids" jsonb_path_ops);

-- down (reversible):
-- DROP INDEX IF EXISTS "tasks_linked_email_ids_gin_idx";
-- DROP INDEX IF EXISTS "tasks_related_organization_ids_gin_idx";
-- DROP INDEX IF EXISTS "tasks_related_contact_ids_gin_idx";
