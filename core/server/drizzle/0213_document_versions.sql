-- Full-text document versions for activity diffs (OS-204).
-- One row per (document_id, content_version); diffs are computed on read, never stored.
-- Coalesced / retried writes upsert the latest text for that version.

CREATE TABLE IF NOT EXISTS document_versions (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  content_version integer NOT NULL,
  content text NOT NULL,
  actor_kind text NOT NULL DEFAULT 'system',
  actor_user_id text REFERENCES users (id) ON DELETE SET NULL,
  actor_contact_id text REFERENCES contacts (id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS document_versions_document_content_version_uidx
  ON document_versions (document_id, content_version);

CREATE INDEX IF NOT EXISTS document_versions_document_version_idx
  ON document_versions (document_id, content_version);

CREATE INDEX IF NOT EXISTS document_versions_workspace_id_idx
  ON document_versions (workspace_id);

CREATE INDEX IF NOT EXISTS document_versions_deleted_at_idx
  ON document_versions (deleted_at);

-- Replication cursor uses updated_at (upserts bump it).
CREATE INDEX IF NOT EXISTS document_versions_updated_at_id_idx
  ON document_versions (updated_at, id);
