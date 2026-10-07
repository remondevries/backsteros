-- OS-96 addendum: working vs reviewing kind on the agents-API marker.

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "agent_working_kind" text;
--> statement-breakpoint

UPDATE "tasks"
SET "agent_working_kind" = 'working'
WHERE "agent_working_contact_id" IS NOT NULL
  AND ("agent_working_kind" IS NULL OR "agent_working_kind" = '');
