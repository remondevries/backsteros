-- OS-194: audit trail for explicit TransIP transfer-code reveals.
-- Never stores the auth code. Core-local only (not replicated / PowerSync).

CREATE TABLE IF NOT EXISTS "transip_auth_code_reveal_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "domain_name" text NOT NULL,
  "actor_kind" text NOT NULL,
  "actor_user_id" text,
  "actor_api_key_id" text,
  "actor_api_key_name" text,
  "actor_contact_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "transip_auth_code_reveal_logs_workspace_created_idx"
  ON "transip_auth_code_reveal_logs" ("workspace_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "transip_auth_code_reveal_logs_domain_idx"
  ON "transip_auth_code_reveal_logs" ("workspace_id", "domain_name");
