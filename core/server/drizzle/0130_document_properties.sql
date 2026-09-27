ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_key text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS properties jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS front_matter_valid boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS documents_workspace_doc_key_idx
  ON documents (workspace_id, doc_key)
  WHERE doc_key IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS documents_properties_gin_idx
  ON documents USING gin (properties);

-- Sequential DOC-n keys per workspace (entity_counters entity=document_key, scope_id=workspace).

WITH numbered AS (
  SELECT
    id,
    workspace_id,
    row_number() OVER (PARTITION BY workspace_id ORDER BY created_at, id) AS n
  FROM documents
  WHERE doc_key IS NULL
    AND deleted_at IS NULL
    AND kind = 'document'
)
UPDATE documents d
SET doc_key = 'DOC-' || numbered.n::text
FROM numbered
WHERE d.id = numbered.id;

INSERT INTO entity_counters (workspace_id, entity, scope_id, next_value)
SELECT workspace_id, 'document_key', workspace_id, coalesce(max(substring(doc_key from '^DOC-([0-9]+)$')::int), 0) + 1
FROM documents
WHERE doc_key IS NOT NULL AND deleted_at IS NULL
GROUP BY workspace_id
ON CONFLICT (workspace_id, entity, scope_id) DO UPDATE
SET next_value = GREATEST(entity_counters.next_value, EXCLUDED.next_value),
    updated_at = now();
