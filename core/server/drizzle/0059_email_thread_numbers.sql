ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "number" integer;
--> statement-breakpoint
WITH "numbered" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "workspace_id"
      ORDER BY "created_at", "id"
    ) AS "rn"
  FROM "email_threads"
)
UPDATE "email_threads"
SET "number" = "numbered"."rn"
FROM "numbered"
WHERE "email_threads"."id" = "numbered"."id";
--> statement-breakpoint
ALTER TABLE "email_threads" ALTER COLUMN "number" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_threads_workspace_number_idx"
  ON "email_threads" ("workspace_id", "number");
--> statement-breakpoint
INSERT INTO "entity_counters" ("workspace_id", "entity", "scope_id", "next_value")
SELECT "workspace_id", 'email', '__workspace__', MAX("number") + 1
FROM "email_threads"
GROUP BY "workspace_id"
ON CONFLICT ("workspace_id", "entity", "scope_id") DO UPDATE
SET
  "next_value" = GREATEST("entity_counters"."next_value", EXCLUDED."next_value"),
  "updated_at" = now();
