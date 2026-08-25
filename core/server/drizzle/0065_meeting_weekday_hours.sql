ALTER TABLE "meeting_scheduling_settings"
  ADD COLUMN IF NOT EXISTS "weekday_hours" jsonb;

UPDATE "meeting_scheduling_settings"
SET "weekday_hours" = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'weekday', weekday,
      'enabled', (
        weekday IN (
          SELECT (jsonb_array_elements_text("working_hours"->'weekdays'))::int
        )
      ),
      'start', COALESCE("working_hours"->>'start', '09:00'),
      'end', COALESCE("working_hours"->>'end', '17:00')
    )
    ORDER BY weekday
  )
  FROM generate_series(1, 7) AS weekday
)
WHERE "weekday_hours" IS NULL;

ALTER TABLE "meeting_scheduling_settings"
  ALTER COLUMN "weekday_hours" SET DEFAULT '[{"weekday":1,"enabled":true,"start":"09:00","end":"17:00"},{"weekday":2,"enabled":true,"start":"09:00","end":"17:00"},{"weekday":3,"enabled":true,"start":"09:00","end":"17:00"},{"weekday":4,"enabled":true,"start":"09:00","end":"17:00"},{"weekday":5,"enabled":true,"start":"09:00","end":"17:00"},{"weekday":6,"enabled":false,"start":"09:00","end":"17:00"},{"weekday":7,"enabled":false,"start":"09:00","end":"17:00"}]'::jsonb;

ALTER TABLE "meeting_scheduling_settings"
  ALTER COLUMN "weekday_hours" SET NOT NULL;
