ALTER TABLE "email_threads" ALTER COLUMN "status" SET DEFAULT 'backlog';

-- Auto-created rows previously defaulted to triage; treat those as backlog.
UPDATE "email_threads" SET "status" = 'backlog' WHERE "status" = 'triage';
