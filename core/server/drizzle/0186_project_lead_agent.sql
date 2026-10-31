-- Project Lead agent: nullable FK to contacts (agent personas via agents.contact_id).
-- Per-agent Channel Connect webhooks already live on agents.webhook_* (ciphertext;
-- never PowerSynced / never returned as plaintext).

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "lead_agent_contact_id" text
  REFERENCES "contacts"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "projects_lead_agent_contact_id_idx"
  ON "projects" ("lead_agent_contact_id");
