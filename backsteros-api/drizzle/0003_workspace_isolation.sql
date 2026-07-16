-- Workspace isolation bootstrap. The deterministic legacy workspace preserves
-- existing single-owner installations during the one-time migration.
CREATE TABLE "workspaces" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "owner_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspaces_slug_unique" UNIQUE("slug"),
  CONSTRAINT "workspaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
  "workspace_id" text NOT NULL,
  "user_id" text NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_members_workspace_user_pk" PRIMARY KEY("workspace_id","user_id"),
  CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "workspace_settings" (
  "workspace_id" text PRIMARY KEY NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "entity_counters" (
  "workspace_id" text NOT NULL,
  "entity" text NOT NULL,
  "scope_id" text NOT NULL,
  "next_value" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "entity_counters_workspace_entity_scope_pk" PRIMARY KEY("workspace_id","entity","scope_id"),
  CONSTRAINT "entity_counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "mutation_receipts" (
  "workspace_id" text NOT NULL,
  "mutation_id" text NOT NULL,
  "device_id" text,
  "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mutation_receipts_workspace_mutation_pk" PRIMARY KEY("workspace_id","mutation_id"),
  CONSTRAINT "mutation_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade
);
--> statement-breakpoint
-- Keep one legacy workspace for all pre-workspace rows. If users exist, the
-- oldest user owns it; otherwise the first Clerk login will claim membership.
INSERT INTO "workspaces" ("id", "name", "slug", "owner_user_id")
SELECT
  'ws_legacy_default',
  'BacksterOS',
  'backsteros',
  (SELECT "id" FROM "users" ORDER BY "created_at", "id" LIMIT 1)
WHERE EXISTS (
  SELECT 1 FROM "users"
  UNION ALL SELECT 1 FROM "api_keys"
  UNION ALL SELECT 1 FROM "projects"
  UNION ALL SELECT 1 FROM "tasks"
  UNION ALL SELECT 1 FROM "documents"
  UNION ALL SELECT 1 FROM "sync_events"
)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "workspace_members" ("workspace_id", "user_id", "role")
SELECT 'ws_legacy_default', "id", CASE WHEN "role" = 'owner' THEN 'owner' ELSE 'member' END
FROM "users"
WHERE EXISTS (SELECT 1 FROM "workspaces" WHERE "id" = 'ws_legacy_default')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "workspace_settings" ("workspace_id")
SELECT "id" FROM "workspaces" WHERE "id" = 'ws_legacy_default'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "workspace_id" text;
ALTER TABLE "projects" ADD COLUMN "workspace_id" text;
ALTER TABLE "tasks" ADD COLUMN "workspace_id" text;
ALTER TABLE "documents" ADD COLUMN "workspace_id" text;
ALTER TABLE "sync_events" ADD COLUMN "workspace_id" text;
--> statement-breakpoint
UPDATE "api_keys" SET "workspace_id" = 'ws_legacy_default' WHERE "workspace_id" IS NULL;
UPDATE "projects" SET "workspace_id" = 'ws_legacy_default' WHERE "workspace_id" IS NULL;
UPDATE "tasks" SET "workspace_id" = 'ws_legacy_default' WHERE "workspace_id" IS NULL;
UPDATE "documents" SET "workspace_id" = 'ws_legacy_default' WHERE "workspace_id" IS NULL;
UPDATE "sync_events" SET "workspace_id" = 'ws_legacy_default' WHERE "workspace_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "projects" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "sync_events" ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "sync_events" DROP CONSTRAINT IF EXISTS "sync_events_mutation_id_unique";
DROP INDEX IF EXISTS "projects_key_idx";
DROP INDEX IF EXISTS "tasks_project_number_idx";
--> statement-breakpoint
CREATE INDEX "workspaces_owner_user_id_idx" ON "workspaces" ("owner_user_id");
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" ("user_id");
CREATE INDEX "api_keys_workspace_id_idx" ON "api_keys" ("workspace_id");
CREATE UNIQUE INDEX "projects_workspace_key_unique" ON "projects" ("workspace_id","key");
CREATE INDEX "projects_workspace_id_idx" ON "projects" ("workspace_id");
CREATE INDEX "tasks_workspace_id_idx" ON "tasks" ("workspace_id");
CREATE UNIQUE INDEX "tasks_workspace_project_number_unique" ON "tasks" ("workspace_id", COALESCE("project_id", '__inbox__'), "number");
CREATE INDEX "documents_workspace_id_idx" ON "documents" ("workspace_id");
CREATE UNIQUE INDEX "sync_events_workspace_mutation_unique" ON "sync_events" ("workspace_id","mutation_id");
CREATE INDEX "sync_events_workspace_cursor_idx" ON "sync_events" ("workspace_id","cursor");
CREATE INDEX "mutation_receipts_created_at_idx" ON "mutation_receipts" ("created_at");
--> statement-breakpoint
-- Seed the next counter from existing data. The UPSERT allocation path returns
-- this value and increments it while holding the row lock.
INSERT INTO "entity_counters" ("workspace_id", "entity", "scope_id", "next_value")
SELECT "workspace_id", 'task', COALESCE("project_id", '__inbox__'), MAX("number") + 1
FROM "tasks"
GROUP BY "workspace_id", COALESCE("project_id", '__inbox__')
ON CONFLICT ("workspace_id","entity","scope_id") DO UPDATE
SET "next_value" = GREATEST("entity_counters"."next_value", EXCLUDED."next_value"),
    "updated_at" = now();
