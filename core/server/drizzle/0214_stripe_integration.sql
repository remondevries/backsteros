-- Stripe Balance Transactions live proxy (workspace secret key).
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "stripe_secret_key" text;
