ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tracked_duration_seconds integer;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS tracked_duration_seconds integer;

UPDATE tasks
SET tracked_duration_seconds = tracked_minutes * 60
WHERE tracked_minutes IS NOT NULL
  AND tracked_duration_seconds IS NULL;

UPDATE meetings
SET tracked_duration_seconds = tracked_minutes * 60
WHERE tracked_minutes IS NOT NULL
  AND tracked_duration_seconds IS NULL;
