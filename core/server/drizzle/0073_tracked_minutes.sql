ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tracked_minutes integer;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS tracked_minutes integer;
