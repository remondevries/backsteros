-- Portal "To" recipients on client estimates (contact allowlist).
ALTER TABLE "client_estimates"
  ADD COLUMN IF NOT EXISTS "to_contact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
