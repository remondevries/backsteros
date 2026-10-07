-- LDP-20: client proposal/estimate posts for portal Financials.
-- Tier C (server-primary REST); markdown bodies stored inline for the basics.
-- Idempotent: local may already have client_estimates from an earlier 0140 draft.

CREATE TABLE IF NOT EXISTS "client_estimates" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE set null,
  "project_id" text REFERENCES "projects"("id") ON DELETE set null,
  "title" text NOT NULL,
  "subtitle" text,
  "client_label" text,
  "author_name" text,
  "version_label" text,
  "document_date" text,
  "status" text NOT NULL DEFAULT 'draft',
  "proposal_markdown" text NOT NULL DEFAULT '',
  "estimate_markdown" text NOT NULL DEFAULT '',
  "sort_order" bigint NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_estimates_workspace_id_idx"
  ON "client_estimates" ("workspace_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_estimates_organization_id_idx"
  ON "client_estimates" ("organization_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_estimates_deleted_at_idx"
  ON "client_estimates" ("deleted_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_estimates_status_idx"
  ON "client_estimates" ("workspace_id", "status");
