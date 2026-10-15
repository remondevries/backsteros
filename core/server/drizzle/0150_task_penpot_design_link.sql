-- Task ↔ BacksterDESIGN (Penpot) item link (file / page / board).
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "penpot_file_id" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "penpot_page_id" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "penpot_object_id" text;
CREATE INDEX IF NOT EXISTS "tasks_penpot_file_id_idx" ON "tasks" ("penpot_file_id");
