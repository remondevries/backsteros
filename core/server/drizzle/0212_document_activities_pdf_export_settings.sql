-- Document activity timeline + PDF export settings (OS-202).
-- Event types: rename | front_matter_change | text_content_change | pdf_creation
-- Brand is per project/space; all other PDF settings are per document.

CREATE TABLE IF NOT EXISTS document_activities (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  project_id text REFERENCES projects (id) ON DELETE SET NULL,
  type text NOT NULL,
  actor_kind text NOT NULL DEFAULT 'user',
  actor_user_id text REFERENCES users (id) ON DELETE SET NULL,
  actor_contact_id text REFERENCES contacts (id) ON DELETE SET NULL,
  actor_api_key_id text,
  actor_name text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS document_activities_document_occurred_idx
  ON document_activities (document_id, occurred_at);

CREATE INDEX IF NOT EXISTS document_activities_project_occurred_idx
  ON document_activities (project_id, occurred_at);

CREATE INDEX IF NOT EXISTS document_activities_workspace_type_occurred_idx
  ON document_activities (workspace_id, type, occurred_at);

CREATE INDEX IF NOT EXISTS document_activities_actor_contact_id_idx
  ON document_activities (actor_contact_id);

CREATE INDEX IF NOT EXISTS document_activities_deleted_at_idx
  ON document_activities (deleted_at);

-- Replication cursor uses updated_at (coalesce merges bump it).
CREATE INDEX IF NOT EXISTS document_activities_updated_at_id_idx
  ON document_activities (updated_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS document_activities_workspace_client_event_uidx
  ON document_activities (workspace_id, client_event_id)
  WHERE client_event_id IS NOT NULL AND deleted_at IS NULL;

-- Project/space brand only (business = lemo-design, personal = rdv).
CREATE TABLE IF NOT EXISTS pdf_export_brands (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  scope_type text NOT NULL,
  scope_id text NOT NULL,
  brand text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by_user_id text REFERENCES users (id) ON DELETE SET NULL,
  updated_by_contact_id text REFERENCES contacts (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS pdf_export_brands_workspace_scope_uidx
  ON pdf_export_brands (workspace_id, scope_type, scope_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS pdf_export_brands_workspace_id_idx
  ON pdf_export_brands (workspace_id);

-- Per-document PDF export settings (toggles, fields, cover pick).
CREATE TABLE IF NOT EXISTS pdf_export_document_settings (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  project_id text REFERENCES projects (id) ON DELETE SET NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_by_user_id text REFERENCES users (id) ON DELETE SET NULL,
  updated_by_contact_id text REFERENCES contacts (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS pdf_export_document_settings_document_uidx
  ON pdf_export_document_settings (workspace_id, document_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS pdf_export_document_settings_project_id_idx
  ON pdf_export_document_settings (project_id);

ALTER TABLE letters
  ADD COLUMN IF NOT EXISTS source_document_id text REFERENCES documents (id) ON DELETE SET NULL;

ALTER TABLE letters
  ADD COLUMN IF NOT EXISTS source_content_version integer;

CREATE INDEX IF NOT EXISTS letters_source_document_id_idx
  ON letters (source_document_id);
