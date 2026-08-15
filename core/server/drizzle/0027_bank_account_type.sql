ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'bank_account' NOT NULL;
--> statement-breakpoint
UPDATE "bank_accounts"
SET "type" = CASE
  WHEN "institution" = 'amex' THEN 'credit_card'
  ELSE 'bank_account'
END
WHERE "type" = 'bank_account' OR "type" IS NULL;
--> statement-breakpoint
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "institution";
