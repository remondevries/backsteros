ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "due_end_date" timestamp with time zone;
