-- OS-162 / audit #9: track how far sync_events feed consumers have advanced
-- so retention can delete only processed events (never in-flight / retryable).
-- Safe on both cores (IF NOT EXISTS / DEFAULT 0). Reversible via down block.

ALTER TABLE "core_sync_event_replication_state"
  ADD COLUMN IF NOT EXISTS "peer_after_cursor" integer NOT NULL DEFAULT 0;

-- down (reversible):
-- ALTER TABLE "core_sync_event_replication_state" DROP COLUMN IF EXISTS "peer_after_cursor";
