ALTER TABLE documents ADD COLUMN IF NOT EXISTS tracked_minutes integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tracked_duration_seconds integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_tracked_at timestamptz;
