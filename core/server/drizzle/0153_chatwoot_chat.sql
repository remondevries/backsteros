-- Chatwoot integration secrets + Tier C conversation mirror (ADR-040).
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "chatwoot_base_url" text;
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "chatwoot_account_id" text;
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "chatwoot_api_access_token" text;
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "chatwoot_webhook_secret" text;

CREATE TABLE IF NOT EXISTS "chat_conversations" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "external_id" text NOT NULL,
  "inbox_id" text,
  "inbox_name" text,
  "channel_type" text,
  "status" text NOT NULL DEFAULT 'open',
  "contact_name" text,
  "contact_email" text,
  "contact_phone" text,
  "contact_avatar_url" text,
  "last_message_preview" text,
  "last_activity_at" timestamp with time zone,
  "unread" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "chat_conversations_workspace_external_uidx"
  ON "chat_conversations" ("workspace_id", "external_id");
CREATE INDEX IF NOT EXISTS "chat_conversations_workspace_id_idx"
  ON "chat_conversations" ("workspace_id");
CREATE INDEX IF NOT EXISTS "chat_conversations_workspace_activity_idx"
  ON "chat_conversations" ("workspace_id", "last_activity_at");

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "conversation_id" text NOT NULL REFERENCES "chat_conversations"("id") ON DELETE cascade,
  "external_id" text NOT NULL,
  "direction" text NOT NULL,
  "content" text NOT NULL DEFAULT '',
  "content_type" text,
  "sender_name" text,
  "private" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_workspace_external_uidx"
  ON "chat_messages" ("workspace_id", "external_id");
CREATE INDEX IF NOT EXISTS "chat_messages_conversation_id_idx"
  ON "chat_messages" ("conversation_id");
CREATE INDEX IF NOT EXISTS "chat_messages_workspace_id_idx"
  ON "chat_messages" ("workspace_id");

CREATE TABLE IF NOT EXISTS "chat_webhook_events" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "delivery_id" text NOT NULL,
  "event_type" text,
  "processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "chat_webhook_events_delivery_uidx"
  ON "chat_webhook_events" ("delivery_id");
CREATE INDEX IF NOT EXISTS "chat_webhook_events_workspace_id_idx"
  ON "chat_webhook_events" ("workspace_id");
