ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE "api_keys" SET "updated_at" = COALESCE("revoked_at", "created_at") WHERE "updated_at" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_updated_at_id_idx" ON "api_keys" ("updated_at", "id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core_replication_cursors" (
	"table_name" text PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"row_id" text DEFAULT '' NOT NULL
);
