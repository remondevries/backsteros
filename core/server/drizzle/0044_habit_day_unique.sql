WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY habit_id, due_date
      ORDER BY
        CASE status
          WHEN 'completed' THEN 0
          WHEN 'canceled' THEN 2
          WHEN 'duplicated' THEN 3
          ELSE 1
        END,
        created_at ASC,
        id ASC
    ) AS rn
  FROM tasks
  WHERE deleted_at IS NULL
    AND habit_id IS NOT NULL
    AND due_date IS NOT NULL
)
UPDATE tasks
SET deleted_at = now(), updated_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_habit_due_unique"
ON "tasks" ("habit_id", "due_date")
WHERE "habit_id" IS NOT NULL AND "deleted_at" IS NULL AND "due_date" IS NOT NULL;
