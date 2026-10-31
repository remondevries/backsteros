-- OS-162 review: index for retention prune by created_at (and workspace).
-- sync_events_created_at_idx may already exist from 0002; IF NOT EXISTS is safe.
-- Reversible via the down block below.

CREATE INDEX IF NOT EXISTS "sync_events_created_at_idx"
  ON "sync_events" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_events_workspace_created_at_idx"
  ON "sync_events" USING btree ("workspace_id", "created_at");

-- down (reversible):
-- DROP INDEX IF EXISTS "sync_events_workspace_created_at_idx";
-- (leave sync_events_created_at_idx — owned by 0002)
