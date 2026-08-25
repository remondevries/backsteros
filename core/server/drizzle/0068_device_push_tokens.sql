-- Device push tokens for Expo / APNs inbox triage notifications

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  token text NOT NULL,
  device_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS device_push_tokens_workspace_token_uidx
  ON device_push_tokens (workspace_id, token);

CREATE INDEX IF NOT EXISTS device_push_tokens_workspace_id_idx
  ON device_push_tokens (workspace_id);
