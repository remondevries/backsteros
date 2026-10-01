CREATE TABLE IF NOT EXISTS "replication_dead_letters" (
	"id" text PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"row_id" text NOT NULL,
	"direction" text NOT NULL,
	"error_code" text,
	"error_message" text NOT NULL,
	"row_payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "replication_dead_letters_open_uidx"
  ON "replication_dead_letters" ("table_name", "row_id", "direction")
  WHERE "resolved_at" is null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "replication_dead_letters_retry_idx"
  ON "replication_dead_letters" ("resolved_at", "next_retry_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "replication_reconcile_mismatches" (
	"table_name" text PRIMARY KEY NOT NULL,
	"local_count" integer NOT NULL,
	"peer_count" integer NOT NULL,
	"local_fingerprint" text NOT NULL,
	"peer_fingerprint" text NOT NULL,
	"missing_locally" integer DEFAULT 0 NOT NULL,
	"missing_on_peer" integer DEFAULT 0 NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
