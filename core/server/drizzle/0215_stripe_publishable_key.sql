-- Stripe publishable / API key alongside secret key.
ALTER TABLE "workspace_integration_secrets" ADD COLUMN IF NOT EXISTS "stripe_publishable_key" text;
