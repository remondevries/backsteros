-- Structured codebase Development / Production locations.
-- Compat string columns (local_working_directory, development_location,
-- production_location) remain and are mirrored from these objects on write.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "development" jsonb;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "production" jsonb;

-- Fold Local into Development (kind=local) for codebase projects.
-- - local-only → Development { kind: local, path }
-- - TV (same path in both) → same fold
-- - OS (BacksterOS): Remon chose Mac path as Development local; drop
--   former development_location=/home/deploy/Projects/Test (recorded in
--   the shipping commit / agent report, not in DB).
UPDATE "projects"
SET
  "development" = jsonb_build_object(
    'kind',
    'local',
    'path',
    TRIM("local_working_directory")
  ),
  "development_location" = TRIM("local_working_directory"),
  "updated_at" = NOW()
WHERE
  "deleted_at" IS NULL
  AND "type" = 'codebase'
  AND COALESCE(TRIM("local_working_directory"), '') <> ''
  AND (
    COALESCE(TRIM("development_location"), '') = ''
    OR TRIM("development_location") = TRIM("local_working_directory")
    OR "key" = 'OS'
  )
  AND "development" IS NULL;

-- Remaining distinct development_location paths → Development kind=server
-- (Mac cwd stays in local_working_directory for FS/agent local execution).
UPDATE "projects"
SET
  "development" = jsonb_build_object(
    'kind',
    'server',
    'path',
    TRIM("development_location"),
    'host',
    NULL
  ),
  "updated_at" = NOW()
WHERE
  "deleted_at" IS NULL
  AND "type" = 'codebase'
  AND COALESCE(TRIM("development_location"), '') <> ''
  AND "development" IS NULL;

-- Backfill Production object from legacy production_location path.
UPDATE "projects"
SET
  "production" = jsonb_build_object(
    'server',
    NULL,
    'url',
    NULL,
    'deployMethod',
    NULL,
    'branch',
    NULL,
    'path',
    TRIM("production_location")
  ),
  "updated_at" = NOW()
WHERE
  "deleted_at" IS NULL
  AND "type" = 'codebase'
  AND COALESCE(TRIM("production_location"), '') <> ''
  AND "production" IS NULL;
