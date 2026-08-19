ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "agentmail_inbox_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
UPDATE "workspace_integration_secrets"
SET "agentmail_inbox_ids" = jsonb_build_array("agentmail_inbox_id")
WHERE "agentmail_inbox_id" IS NOT NULL
  AND btrim("agentmail_inbox_id") <> ''
  AND ("agentmail_inbox_ids" = '[]'::jsonb OR "agentmail_inbox_ids" IS NULL);
