ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "email_grok_webhook_url" text,
  ADD COLUMN IF NOT EXISTS "email_grok_webhook_key" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_agent_callbacks" (
  "request_id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "inbox_id" text NOT NULL,
  "message_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "result" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_agent_callbacks_workspace_id_idx"
  ON "email_agent_callbacks" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_agent_callbacks_expires_at_idx"
  ON "email_agent_callbacks" ("expires_at");
