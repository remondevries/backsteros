-- Polymorphic time ledger (source of truth for tracked duration).
CREATE TABLE IF NOT EXISTS time_entries (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  actor_user_id text REFERENCES users (id) ON DELETE SET NULL,
  actor_contact_id text REFERENCES contacts (id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'timer',
  note text,
  project_id text REFERENCES projects (id) ON DELETE SET NULL,
  organization_id text REFERENCES organizations (id) ON DELETE SET NULL,
  legacy_start_activity_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS time_entries_workspace_entity_idx
  ON time_entries (workspace_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS time_entries_workspace_started_idx
  ON time_entries (workspace_id, started_at);

CREATE INDEX IF NOT EXISTS time_entries_workspace_project_idx
  ON time_entries (workspace_id, project_id);

CREATE INDEX IF NOT EXISTS time_entries_workspace_actor_contact_idx
  ON time_entries (workspace_id, actor_contact_id);

CREATE INDEX IF NOT EXISTS time_entries_workspace_open_idx
  ON time_entries (workspace_id, entity_type, entity_id)
  WHERE ended_at IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_per_entity_uidx
  ON time_entries (workspace_id, entity_type, entity_id)
  WHERE ended_at IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_legacy_start_activity_uidx
  ON time_entries (workspace_id, legacy_start_activity_id)
  WHERE legacy_start_activity_id IS NOT NULL;
