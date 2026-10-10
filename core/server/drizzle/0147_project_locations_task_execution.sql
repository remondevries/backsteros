-- OS-106: per-environment locations on codebase projects + task execution override.
ALTER TABLE "projects" ADD COLUMN "development_location" text;
ALTER TABLE "projects" ADD COLUMN "production_location" text;
ALTER TABLE "projects" ADD COLUMN "local_location" text;
ALTER TABLE "projects" ADD COLUMN "development_setup_status" text;
ALTER TABLE "projects" ADD COLUMN "development_setup_error" text;
ALTER TABLE "projects" ADD COLUMN "development_setup_updated_at" timestamp with time zone;

ALTER TABLE "tasks" ADD COLUMN "execution_location" text;
ALTER TABLE "tasks" ADD COLUMN "execution_location_locked_at" timestamp with time zone;
