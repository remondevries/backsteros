-- financial_import_batches joins core replication (insert-only, cursor on created_at).
CREATE INDEX IF NOT EXISTS "financial_import_batches_replication_tip_idx" ON "financial_import_batches" ("created_at", "id");
