-- BacksterDESIGN link: BacksterOS project ↔ Penpot project (docs/19).
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "penpot_project_id" text;
CREATE INDEX IF NOT EXISTS "projects_penpot_project_id_idx" ON "projects" ("penpot_project_id");
