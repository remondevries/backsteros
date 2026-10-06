-- OS-92: per-task automate-completion flag + encrypted auto-review webhook
-- outbox (cloud delivers; table twins between cores).

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "automate_completion" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "auto_review_delivery_status" text;
--> statement-breakpoint

ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "auto_review_webhook_url" text,
  ADD COLUMN IF NOT EXISTS "auto_review_webhook_secret_ciphertext" text,
  ADD COLUMN IF NOT EXISTS "auto_review_webhook_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auto_review_webhook_deliveries" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "task_id" text REFERENCES "tasks"("id") ON DELETE cascade,
  "event" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempt" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_attempt_at" timestamp with time zone,
  "last_http_status" integer,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auto_review_webhook_deliveries_due_idx"
  ON "auto_review_webhook_deliveries" ("status", "next_attempt_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auto_review_webhook_deliveries_task_id_idx"
  ON "auto_review_webhook_deliveries" ("task_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auto_review_webhook_deliveries_workspace_id_idx"
  ON "auto_review_webhook_deliveries" ("workspace_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auto_review_webhook_deliveries_replication_tip_idx"
  ON "auto_review_webhook_deliveries" ("updated_at", "id");
