-- OS-116: allow meetings.external_calendar_event_id without a matching
-- external_calendar_events row (agent POST was 500 on FK violation).
-- Keep the partial unique index from 0146; only drop the FK.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON t.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND t.relname = 'meetings'
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) LIKE '%external_calendar_event_id%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "meetings" DROP CONSTRAINT %I', con_name);
  END IF;
END $$;
