-- OS-164: persist Settings webhook Test pass on the agent row so the chat
-- roster does not depend on per-window localStorage.
ALTER TABLE "agents"
  ADD COLUMN IF NOT EXISTS "webhook_verified_at" timestamptz;
--> statement-breakpoint

-- down (reversible):
-- ALTER TABLE "agents" DROP COLUMN IF EXISTS "webhook_verified_at";
