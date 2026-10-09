ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "external_calendar_event_id" text
  REFERENCES "external_calendar_events"("id") ON DELETE set null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meetings_external_calendar_event_id_uidx"
  ON "meetings" ("external_calendar_event_id")
  WHERE "external_calendar_event_id" IS NOT NULL AND "deleted_at" IS NULL;
