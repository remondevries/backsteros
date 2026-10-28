-- OS-146: agent-owned outbound webhooks for chat/email messages.
CREATE TABLE IF NOT EXISTS "agent_message_webhooks" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "api_key_id" text REFERENCES "api_keys"("id") ON DELETE SET NULL,
  "url" text NOT NULL,
  "secret_ciphertext" text NOT NULL,
  "events" text[] NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_message_webhooks_workspace_idx"
  ON "agent_message_webhooks" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_message_webhooks_api_key_idx"
  ON "agent_message_webhooks" ("api_key_id");
