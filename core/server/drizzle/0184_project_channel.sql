-- Project chat-room Channel: jsonb { uri, name? }.
-- Examples: { "uri": "grokbot://app/v1/agent?id=<uuid>", "name": "BacksterOS" }
-- No backfill — set via agent project API / Locations popover.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "channel" jsonb;
