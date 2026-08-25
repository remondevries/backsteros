UPDATE "meeting_scheduling_settings"
SET "weekday_hours" = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN elem ? 'slots' THEN elem
        ELSE jsonb_build_object(
          'weekday',
          (elem->>'weekday')::int,
          'enabled',
          COALESCE((elem->>'enabled')::boolean, false),
          'slots',
          jsonb_build_array(
            jsonb_build_object(
              'start',
              COALESCE(elem->>'start', '09:00'),
              'end',
              COALESCE(elem->>'end', '17:00')
            )
          )
        )
      END
      ORDER BY (elem->>'weekday')::int
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements("weekday_hours") AS elem
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements("weekday_hours") AS elem
  WHERE NOT (elem ? 'slots')
);

ALTER TABLE "meeting_scheduling_settings"
  ALTER COLUMN "weekday_hours"
  SET DEFAULT '[{"weekday":1,"enabled":true,"slots":[{"start":"09:00","end":"17:00"}]},{"weekday":2,"enabled":true,"slots":[{"start":"09:00","end":"17:00"}]},{"weekday":3,"enabled":true,"slots":[{"start":"09:00","end":"17:00"}]},{"weekday":4,"enabled":true,"slots":[{"start":"09:00","end":"17:00"}]},{"weekday":5,"enabled":true,"slots":[{"start":"09:00","end":"17:00"}]},{"weekday":6,"enabled":false,"slots":[{"start":"09:00","end":"17:00"}]},{"weekday":7,"enabled":false,"slots":[{"start":"09:00","end":"17:00"}]}]'::jsonb;
