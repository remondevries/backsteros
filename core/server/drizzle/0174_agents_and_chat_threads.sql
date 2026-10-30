-- OS-151: agents as records with per-agent webhook settings.
-- OS-150: shell chat threads + messages for Remon ↔ agent loop.
CREATE TABLE IF NOT EXISTS "agents" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "contact_id" text REFERENCES "contacts"("id") ON DELETE SET NULL,
  "api_key_id" text REFERENCES "api_keys"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "avatar_url" text,
  "role" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "webhook_url" text,
  "webhook_secret_ciphertext" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_workspace_id_idx" ON "agents" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_workspace_contact_idx"
  ON "agents" ("workspace_id", "contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_api_key_id_idx" ON "agents" ("api_key_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_threads" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "agent_id" text NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "pending_reply_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_threads_workspace_agent_uidx"
  ON "chat_threads" ("workspace_id", "agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_threads_workspace_id_idx"
  ON "chat_threads" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_threads_agent_id_idx"
  ON "chat_threads" ("agent_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_thread_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "thread_id" text NOT NULL REFERENCES "chat_threads"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "author_contact_id" text REFERENCES "contacts"("id") ON DELETE SET NULL,
  "author_name" text,
  "body" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'done' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_thread_messages_thread_created_idx"
  ON "chat_thread_messages" ("thread_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_thread_messages_workspace_id_idx"
  ON "chat_thread_messages" ("workspace_id");
--> statement-breakpoint
-- Seed Sander (BacksterOS contact vxfdEjiBTB1p3tSU5RZ05) as the first agent.
-- Webhook URL left empty; Remon pastes the Grok Bot URL later in settings.
INSERT INTO "agents" (
  "id",
  "workspace_id",
  "contact_id",
  "api_key_id",
  "name",
  "avatar_url",
  "role",
  "enabled",
  "webhook_url",
  "webhook_secret_ciphertext",
  "created_at",
  "updated_at"
)
SELECT
  'agSanderVxfdEjiBTB1p3',
  'ws_legacy_default',
  'vxfdEjiBTB1p3tSU5RZ05',
  (
    SELECT "id"
    FROM "api_keys"
    WHERE "contact_id" = 'vxfdEjiBTB1p3tSU5RZ05'
      AND "revoked_at" IS NULL
    ORDER BY "created_at" ASC
    LIMIT 1
  ),
  'Sander',
  NULL,
  'Grok Bot agent',
  true,
  NULL,
  NULL,
  now(),
  now()
WHERE EXISTS (
  SELECT 1 FROM "contacts" WHERE "id" = 'vxfdEjiBTB1p3tSU5RZ05'
)
AND NOT EXISTS (
  SELECT 1 FROM "agents" WHERE "id" = 'agSanderVxfdEjiBTB1p3'
)
AND NOT EXISTS (
  SELECT 1
  FROM "agents"
  WHERE "workspace_id" = 'ws_legacy_default'
    AND "contact_id" = 'vxfdEjiBTB1p3tSU5RZ05'
);
