CREATE TABLE IF NOT EXISTS "space_site_keys" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "space_document_id" text NOT NULL,
  "label" text NOT NULL,
  "site_key_prefix" text NOT NULL,
  "site_key_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "space_site_keys" ADD CONSTRAINT "space_site_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "space_site_keys" ADD CONSTRAINT "space_site_keys_space_document_id_documents_id_fk" FOREIGN KEY ("space_document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "space_site_keys_space_prefix_uidx" ON "space_site_keys" ("workspace_id","space_document_id","site_key_prefix");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_site_keys_workspace_id_idx" ON "space_site_keys" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_site_keys_space_document_id_idx" ON "space_site_keys" ("space_document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_site_keys_prefix_idx" ON "space_site_keys" ("site_key_prefix");
--> statement-breakpoint
-- Migrate legacy single key on space_publish_settings into labeled keys.
INSERT INTO "space_site_keys" (
  "id",
  "workspace_id",
  "space_document_id",
  "label",
  "site_key_prefix",
  "site_key_hash",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "workspace_id",
  "space_document_id",
  'Default',
  "site_key_prefix",
  "site_key_hash",
  COALESCE("site_key_created_at", "created_at"),
  "updated_at"
FROM "space_publish_settings"
WHERE "site_key_hash" IS NOT NULL
  AND "site_key_prefix" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "space_site_keys" k
    WHERE k."workspace_id" = "space_publish_settings"."workspace_id"
      AND k."space_document_id" = "space_publish_settings"."space_document_id"
      AND k."site_key_prefix" = "space_publish_settings"."site_key_prefix"
  );
