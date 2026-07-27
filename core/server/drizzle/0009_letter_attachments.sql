CREATE TABLE IF NOT EXISTS "letter_attachments" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "letter_id" text NOT NULL REFERENCES "letters"("id") ON DELETE cascade,
  "storage_key" text NOT NULL,
  "original_filename" text NOT NULL DEFAULT '',
  "content_type" text NOT NULL DEFAULT 'application/pdf',
  "byte_size" integer NOT NULL DEFAULT 0,
  "checksum" text,
  "content_etag" text,
  "sort_order" bigint NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "letter_attachments_workspace_id_idx" ON "letter_attachments" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "letter_attachments_letter_id_idx" ON "letter_attachments" ("letter_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "letter_attachments_letter_sort_idx" ON "letter_attachments" ("letter_id", "sort_order");
--> statement-breakpoint
INSERT INTO "letter_attachments" (
  "id",
  "workspace_id",
  "letter_id",
  "storage_key",
  "original_filename",
  "content_type",
  "byte_size",
  "checksum",
  "content_etag",
  "sort_order",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  'att_' || "id",
  "workspace_id",
  "id",
  "storage_key",
  CASE
    WHEN coalesce(trim("original_filename"), '') = '' THEN 'letter.pdf'
    ELSE "original_filename"
  END,
  coalesce(nullif(trim("content_type"), ''), 'application/pdf'),
  coalesce("byte_size", 0),
  "checksum",
  "content_etag",
  coalesce("sort_order", 0),
  "created_at",
  "updated_at",
  "deleted_at"
FROM "letters"
WHERE coalesce(trim("storage_key"), '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "letter_attachments" existing
    WHERE existing."letter_id" = "letters"."id"
      AND existing."storage_key" = "letters"."storage_key"
      AND existing."deleted_at" IS NULL
  );
