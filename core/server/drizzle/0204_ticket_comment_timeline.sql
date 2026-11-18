-- OS-187: support-ticket timeline fields on task_comments.
-- Email sync/import entries are idempotent on (workspace_id, email_message_id).
-- visibility: client_visible (portal) | internal (staff/agents only).
-- author_side: client | team. occurred_at holds the real email timestamp.
-- imported_* audit who/when backfilled historical mail (never sends mail).

ALTER TABLE "task_comments"
  ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'client_visible';
--> statement-breakpoint

ALTER TABLE "task_comments"
  ADD COLUMN IF NOT EXISTS "author_side" text;
--> statement-breakpoint

ALTER TABLE "task_comments"
  ADD COLUMN IF NOT EXISTS "email_message_id" text;
--> statement-breakpoint

ALTER TABLE "task_comments"
  ADD COLUMN IF NOT EXISTS "email_direction" text;
--> statement-breakpoint

ALTER TABLE "task_comments"
  ADD COLUMN IF NOT EXISTS "email_sender" text;
--> statement-breakpoint

ALTER TABLE "task_comments"
  ADD COLUMN IF NOT EXISTS "occurred_at" timestamp with time zone;
--> statement-breakpoint

UPDATE "task_comments"
SET "occurred_at" = "created_at"
WHERE "occurred_at" IS NULL;
--> statement-breakpoint

ALTER TABLE "task_comments"
  ALTER COLUMN "occurred_at" SET DEFAULT now();
--> statement-breakpoint

ALTER TABLE "task_comments"
  ALTER COLUMN "occurred_at" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "task_comments"
  ADD COLUMN IF NOT EXISTS "imported_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "task_comments"
  ADD COLUMN IF NOT EXISTS "imported_by_contact_id" text
    REFERENCES "contacts"("id") ON DELETE set null;
--> statement-breakpoint

ALTER TABLE "task_comments"
  ADD COLUMN IF NOT EXISTS "imported_by_actor" text;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "task_comments_workspace_email_message_uidx"
  ON "task_comments" ("workspace_id", "email_message_id")
  WHERE "email_message_id" IS NOT NULL AND "deleted_at" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "task_comments_occurred_at_idx"
  ON "task_comments" ("occurred_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "task_comments_visibility_idx"
  ON "task_comments" ("visibility");
