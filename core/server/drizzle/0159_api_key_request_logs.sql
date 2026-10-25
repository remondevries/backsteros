-- Per-request API key usage history (core-local; not replicated).
-- Bounded in application code (~2000 rows / workspace) so agent traffic stays finite.
CREATE TABLE IF NOT EXISTS "api_key_request_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "api_key_id" text REFERENCES "api_keys"("id") ON DELETE SET NULL,
  "api_key_name" text NOT NULL,
  "method" text NOT NULL,
  "path" text NOT NULL,
  "status" integer NOT NULL,
  "address" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_request_logs_workspace_created_idx"
  ON "api_key_request_logs" ("workspace_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_request_logs_api_key_id_idx"
  ON "api_key_request_logs" ("api_key_id");
