-- Durable Moneybird portal invoice reminder ladder (Manual eligibility + R1–R3).

CREATE TABLE IF NOT EXISTS "moneybird_invoice_reminder_tracks" (
  "invoice_id" text PRIMARY KEY NOT NULL,
  "eligible_from_manual_send" boolean DEFAULT false NOT NULL,
  "last_step" integer DEFAULT 0 NOT NULL,
  "sent_at_1" timestamp with time zone,
  "sent_at_2" timestamp with time zone,
  "sent_at_3" timestamp with time zone,
  "due_at_2" timestamp with time zone,
  "due_at_3" timestamp with time zone,
  "locale" text,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "moneybird_invoice_reminder_tracks_due_at_2_idx"
  ON "moneybird_invoice_reminder_tracks" ("due_at_2");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "moneybird_invoice_reminder_tracks_due_at_3_idx"
  ON "moneybird_invoice_reminder_tracks" ("due_at_3");
