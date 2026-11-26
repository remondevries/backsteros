-- Snapshot of Firm/agent PDF export prefs for a saved letter (JSON).
ALTER TABLE letters
  ADD COLUMN IF NOT EXISTS export_settings jsonb;
