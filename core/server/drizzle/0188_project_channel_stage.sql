-- Channel Connect agent progress stage while channel_status=connecting.
-- looking_for_room | joining_room | creating_room | adding_users | finishing
-- Cleared when status becomes active or inactive.

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "channel_stage" text;
