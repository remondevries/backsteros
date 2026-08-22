ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "summary" text;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "transcription" text;

UPDATE "meetings"
SET "summary" = "description"
WHERE "summary" IS NULL AND "description" IS NOT NULL;

ALTER TABLE "meetings" DROP COLUMN IF EXISTS "description";
