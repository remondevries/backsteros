-- Agents report their own Grok Bot id (PATCH /api/v1/agents/me) so project
-- room members can be joined to BacksterOS agent personas.
ALTER TABLE "agents"
  ADD COLUMN IF NOT EXISTS "grokbot_agent_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agents_workspace_grokbot_agent_id_unique"
  ON "agents" ("workspace_id", "grokbot_agent_id")
  WHERE "grokbot_agent_id" IS NOT NULL;
--> statement-breakpoint

-- down (reversible):
-- DROP INDEX IF EXISTS "agents_workspace_grokbot_agent_id_unique";
-- ALTER TABLE "agents" DROP COLUMN IF EXISTS "grokbot_agent_id";
