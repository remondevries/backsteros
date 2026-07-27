-- Circle import wrote existing numbers but never advanced entity_counters.
-- New creates then restarted at 1 and reused display IDs (e.g. CI-1 while
-- legacy CI-2..CI-15 already existed). Floor every counter at max(number)+1.
INSERT INTO "entity_counters" ("workspace_id", "entity", "scope_id", "next_value")
SELECT
  "workspace_id",
  'task',
  COALESCE('project:' || "project_id", 'contact:' || "contact_id", '__inbox__'),
  MAX("number") + 1
FROM "tasks"
GROUP BY
  "workspace_id",
  COALESCE('project:' || "project_id", 'contact:' || "contact_id", '__inbox__')
ON CONFLICT ("workspace_id", "entity", "scope_id") DO UPDATE
SET
  "next_value" = GREATEST("entity_counters"."next_value", EXCLUDED."next_value"),
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "entity_counters" ("workspace_id", "entity", "scope_id", "next_value")
SELECT "workspace_id", 'organization', '__workspace__', MAX("number") + 1
FROM "organizations"
WHERE "number" IS NOT NULL
GROUP BY "workspace_id"
ON CONFLICT ("workspace_id", "entity", "scope_id") DO UPDATE
SET
  "next_value" = GREATEST("entity_counters"."next_value", EXCLUDED."next_value"),
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "entity_counters" ("workspace_id", "entity", "scope_id", "next_value")
SELECT "workspace_id", 'contact', '__workspace__', MAX("number") + 1
FROM "contacts"
WHERE "number" IS NOT NULL
GROUP BY "workspace_id"
ON CONFLICT ("workspace_id", "entity", "scope_id") DO UPDATE
SET
  "next_value" = GREATEST("entity_counters"."next_value", EXCLUDED."next_value"),
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "entity_counters" ("workspace_id", "entity", "scope_id", "next_value")
SELECT "workspace_id", 'letter', '__workspace__', MAX("number") + 1
FROM "letters"
WHERE "number" IS NOT NULL
GROUP BY "workspace_id"
ON CONFLICT ("workspace_id", "entity", "scope_id") DO UPDATE
SET
  "next_value" = GREATEST("entity_counters"."next_value", EXCLUDED."next_value"),
  "updated_at" = now();
