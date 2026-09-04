-- Repair duplicate workspace display numbers (legacy import / client-supplied
-- number collisions), then enforce uniqueness for live rows.

WITH ranked_orgs AS (
  SELECT
    id,
    workspace_id,
    number,
    row_number() OVER (
      PARTITION BY workspace_id, number
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM organizations
  WHERE deleted_at IS NULL AND number IS NOT NULL
),
dup_orgs AS (
  SELECT id, workspace_id
  FROM ranked_orgs
  WHERE rn > 1
),
org_next AS (
  SELECT
    d.id,
    coalesce(c.max_number, 0)
      + row_number() OVER (PARTITION BY d.workspace_id ORDER BY d.id) AS new_number
  FROM dup_orgs d
  LEFT JOIN (
    SELECT workspace_id, max(number) AS max_number
    FROM organizations
    WHERE deleted_at IS NULL AND number IS NOT NULL
    GROUP BY workspace_id
  ) c ON c.workspace_id = d.workspace_id
)
UPDATE organizations AS o
SET number = org_next.new_number, updated_at = now()
FROM org_next
WHERE o.id = org_next.id;

WITH ranked_contacts AS (
  SELECT
    id,
    workspace_id,
    number,
    row_number() OVER (
      PARTITION BY workspace_id, number
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM contacts
  WHERE deleted_at IS NULL AND number IS NOT NULL
),
dup_contacts AS (
  SELECT id, workspace_id
  FROM ranked_contacts
  WHERE rn > 1
),
contact_next AS (
  SELECT
    d.id,
    coalesce(c.max_number, 0)
      + row_number() OVER (PARTITION BY d.workspace_id ORDER BY d.id) AS new_number
  FROM dup_contacts d
  LEFT JOIN (
    SELECT workspace_id, max(number) AS max_number
    FROM contacts
    WHERE deleted_at IS NULL AND number IS NOT NULL
    GROUP BY workspace_id
  ) c ON c.workspace_id = d.workspace_id
)
UPDATE contacts AS o
SET number = contact_next.new_number, updated_at = now()
FROM contact_next
WHERE o.id = contact_next.id;

INSERT INTO entity_counters (workspace_id, entity, scope_id, next_value)
SELECT workspace_id, 'organization', '__workspace__', coalesce(max(number), 0) + 1
FROM organizations
WHERE deleted_at IS NULL AND number IS NOT NULL
GROUP BY workspace_id
ON CONFLICT (workspace_id, entity, scope_id) DO UPDATE
SET
  next_value = GREATEST(entity_counters.next_value, EXCLUDED.next_value),
  updated_at = now();

INSERT INTO entity_counters (workspace_id, entity, scope_id, next_value)
SELECT workspace_id, 'contact', '__workspace__', coalesce(max(number), 0) + 1
FROM contacts
WHERE deleted_at IS NULL AND number IS NOT NULL
GROUP BY workspace_id
ON CONFLICT (workspace_id, entity, scope_id) DO UPDATE
SET
  next_value = GREATEST(entity_counters.next_value, EXCLUDED.next_value),
  updated_at = now();

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_workspace_number_unique"
  ON "organizations" ("workspace_id", "number")
  WHERE "deleted_at" IS NULL AND "number" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "contacts_workspace_number_unique"
  ON "contacts" ("workspace_id", "number")
  WHERE "deleted_at" IS NULL AND "number" IS NOT NULL;
