CREATE TABLE IF NOT EXISTS "email_thread_comments" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "email_thread_id" text NOT NULL REFERENCES "email_threads"("id") ON DELETE cascade,
  "body" text NOT NULL DEFAULT '',
  "author" text NOT NULL DEFAULT 'user',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "email_thread_comments_email_thread_id_idx"
  ON "email_thread_comments" ("email_thread_id");
CREATE INDEX IF NOT EXISTS "email_thread_comments_workspace_id_idx"
  ON "email_thread_comments" ("workspace_id");
CREATE INDEX IF NOT EXISTS "email_thread_comments_created_at_idx"
  ON "email_thread_comments" ("created_at");
CREATE INDEX IF NOT EXISTS "email_thread_comments_deleted_at_idx"
  ON "email_thread_comments" ("deleted_at");

-- Migrate short-lived notes into comments (author = user).
INSERT INTO "email_thread_comments" (
  "id",
  "workspace_id",
  "email_thread_id",
  "body",
  "author",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  "id",
  "workspace_id",
  "email_thread_id",
  "body",
  'user',
  "created_at",
  "updated_at",
  "deleted_at"
FROM "email_thread_notes"
ON CONFLICT ("id") DO NOTHING;

DROP TABLE IF EXISTS "email_thread_notes";
