ALTER TABLE "financial_categories" ADD COLUMN IF NOT EXISTS "icon" text;
--> statement-breakpoint
ALTER TABLE "financial_categories" ADD COLUMN IF NOT EXISTS "budget_cents" bigint;
--> statement-breakpoint
ALTER TABLE "financial_categories" ADD COLUMN IF NOT EXISTS "listing" text DEFAULT 'regular' NOT NULL;
