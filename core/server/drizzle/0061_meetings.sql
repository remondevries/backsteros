CREATE TABLE IF NOT EXISTS "meetings" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "number" integer,
  "title" text NOT NULL,
  "description" text,
  "start_at" timestamp with time zone NOT NULL,
  "end_at" timestamp with time zone NOT NULL,
  "sort_order" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

ALTER TABLE "meetings"
  ADD CONSTRAINT "meetings_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "meetings_workspace_id_idx" ON "meetings" ("workspace_id");
CREATE INDEX IF NOT EXISTS "meetings_workspace_number_idx" ON "meetings" ("workspace_id", "number");
CREATE INDEX IF NOT EXISTS "meetings_workspace_start_at_idx" ON "meetings" ("workspace_id", "start_at");

INSERT INTO "entity_counters" ("workspace_id", "entity", "scope_id", "next_value")
SELECT "workspace_id", 'meeting', '__workspace__', COALESCE(MAX("number"), 0) + 1
FROM "meetings"
GROUP BY "workspace_id"
ON CONFLICT ("workspace_id", "entity", "scope_id") DO UPDATE SET
  "next_value" = GREATEST("entity_counters"."next_value", EXCLUDED."next_value"),
  "updated_at" = now();
