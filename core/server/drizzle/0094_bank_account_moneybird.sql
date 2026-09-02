ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "moneybird_financial_account_id" text;
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "moneybird_last_synced_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_accounts_workspace_moneybird_financial_account_uidx"
  ON "bank_accounts" ("workspace_id", "moneybird_financial_account_id")
  WHERE "moneybird_financial_account_id" IS NOT NULL AND "deleted_at" IS NULL;
