-- Persist Idempotency-Key responses across process restarts (24h TTL).

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "scope" text NOT NULL,
  "key" text NOT NULL,
  "status" integer NOT NULL,
  "body" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  PRIMARY KEY ("scope", "key")
);

CREATE INDEX IF NOT EXISTS "idempotency_keys_expires_at_idx"
  ON "idempotency_keys" ("expires_at");
