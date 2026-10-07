-- LDP-20 follow-up: estimate status model + ES number / amount / author contact.
-- Idempotent for local (already has client_estimates) and cloud.

ALTER TABLE "client_estimates"
  ADD COLUMN IF NOT EXISTS "number" integer;
--> statement-breakpoint

ALTER TABLE "client_estimates"
  ADD COLUMN IF NOT EXISTS "total_amount_cents" bigint;
--> statement-breakpoint

ALTER TABLE "client_estimates"
  ADD COLUMN IF NOT EXISTS "author_contact_id" text
  REFERENCES "contacts"("id") ON DELETE set null;
--> statement-breakpoint

UPDATE "client_estimates" SET "status" = 'concept' WHERE "status" = 'draft';
--> statement-breakpoint

UPDATE "client_estimates" SET "status" = 'in_review' WHERE "status" = 'published';
--> statement-breakpoint

UPDATE "client_estimates" SET "status" = 'declined' WHERE "status" = 'archived';
--> statement-breakpoint

ALTER TABLE "client_estimates" ALTER COLUMN "status" SET DEFAULT 'concept';
--> statement-breakpoint

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "workspace_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS next_number
  FROM "client_estimates"
  WHERE "number" IS NULL
)
UPDATE "client_estimates" AS ce
SET "number" = ranked.next_number
FROM ranked
WHERE ce."id" = ranked."id";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "client_estimates_workspace_number_uidx"
  ON "client_estimates" ("workspace_id", "number")
  WHERE "number" IS NOT NULL AND "deleted_at" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_estimates_author_contact_id_idx"
  ON "client_estimates" ("author_contact_id");
