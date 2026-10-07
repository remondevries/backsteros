ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "zernio_api_key" text;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "zernio_profile_id" text;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "zernio_webhook_id" text;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "zernio_webhook_secret" text;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "zernio_webhook_url" text;
--> statement-breakpoint
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "zernio_analytics_cursor" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "platform" text NOT NULL,
  "relation" text DEFAULT 'connected' NOT NULL,
  "provider" text NOT NULL,
  "external_id" text NOT NULL,
  "handle" text,
  "display_name" text,
  "url" text,
  "contact_id" text,
  "organization_id" text,
  "capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "disconnected" boolean DEFAULT false NOT NULL,
  "needs_reconnect" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_accounts_workspace_id_idx" ON "social_accounts" ("workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "social_accounts_workspace_provider_external_uidx" ON "social_accounts" ("workspace_id","provider","external_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "account_id" text NOT NULL REFERENCES "social_accounts"("id") ON DELETE cascade,
  "platform" text NOT NULL,
  "provider" text NOT NULL,
  "external_id" text NOT NULL,
  "url" text,
  "text" text DEFAULT '' NOT NULL,
  "media" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "scheduled_at" timestamp with time zone,
  "posted_at" timestamp with time zone,
  "engagement" jsonb,
  "contact_id" text,
  "organization_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_workspace_id_idx" ON "social_posts" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_account_id_idx" ON "social_posts" ("account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "social_posts_workspace_provider_external_uidx" ON "social_posts" ("workspace_id","provider","external_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_comments" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "post_id" text NOT NULL REFERENCES "social_posts"("id") ON DELETE cascade,
  "account_id" text REFERENCES "social_accounts"("id") ON DELETE set null,
  "external_id" text NOT NULL,
  "author_handle" text DEFAULT '' NOT NULL,
  "author_external_id" text,
  "text" text DEFAULT '' NOT NULL,
  "parent_comment_id" text,
  "hidden" boolean DEFAULT false NOT NULL,
  "contact_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_comments_workspace_id_idx" ON "social_comments" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_comments_post_id_idx" ON "social_comments" ("post_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "social_comments_workspace_external_uidx" ON "social_comments" ("workspace_id","external_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_conversations" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "account_id" text NOT NULL REFERENCES "social_accounts"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "external_id" text NOT NULL,
  "kind" text DEFAULT 'dm' NOT NULL,
  "participant_handle" text,
  "participant_external_id" text,
  "contact_id" text,
  "ticket_id" text,
  "last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_conversations_workspace_id_idx" ON "social_conversations" ("workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "social_conversations_workspace_provider_external_uidx" ON "social_conversations" ("workspace_id","provider","external_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "conversation_id" text NOT NULL REFERENCES "social_conversations"("id") ON DELETE cascade,
  "external_id" text,
  "direction" text NOT NULL,
  "text" text DEFAULT '' NOT NULL,
  "status" text,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_messages_workspace_id_idx" ON "social_messages" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_messages_conversation_id_idx" ON "social_messages" ("conversation_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_webhook_events" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text,
  "processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "social_webhook_events_provider_event_uidx" ON "social_webhook_events" ("provider","event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_webhook_events_workspace_id_idx" ON "social_webhook_events" ("workspace_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_analytics_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "account_id" text REFERENCES "social_accounts"("id") ON DELETE set null,
  "post_external_id" text,
  "platform" text,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_analytics_snapshots_workspace_id_idx" ON "social_analytics_snapshots" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_analytics_snapshots_account_id_idx" ON "social_analytics_snapshots" ("account_id");
