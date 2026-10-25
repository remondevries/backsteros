-- Recoverable API key secrets (encrypted at rest) for owner copy/reveal.
ALTER TABLE "api_keys"
  ADD COLUMN IF NOT EXISTS "secret_ciphertext" text;
