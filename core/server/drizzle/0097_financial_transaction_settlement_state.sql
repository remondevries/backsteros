ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "settlement_state" text;
--> statement-breakpoint
UPDATE "financial_transactions"
SET "settlement_state" = lower(nullif(trim("raw"->>'settlement_state'), ''))
WHERE "settlement_state" IS NULL
  AND "raw" ? 'settlement_state'
  AND nullif(trim("raw"->>'settlement_state'), '') IS NOT NULL;
