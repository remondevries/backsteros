-- OS-138: API key expiry, last-used tracking, and audit log.
ALTER TABLE "api_keys"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "api_keys"
  ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "api_keys"
  ADD COLUMN IF NOT EXISTS "last_used_address" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_key_audit_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "api_key_id" text REFERENCES "api_keys"("id") ON DELETE SET NULL,
  "api_key_name" text NOT NULL,
  "action" text NOT NULL,
  "actor_user_id" text,
  "actor_kind" text,
  "actor_api_key_id" text,
  "address" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_audit_logs_workspace_created_idx"
  ON "api_key_audit_logs" ("workspace_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_audit_logs_api_key_id_idx"
  ON "api_key_audit_logs" ("api_key_id");
