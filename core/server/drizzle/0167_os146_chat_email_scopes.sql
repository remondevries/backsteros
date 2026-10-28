-- OS-146: dedicated chat/email scopes for agent keys; drop settings:read from agents.
-- Access keys (no contact, non-door): append chat:* / email:* when missing.
-- Agent keys (contact_id set): append chat:* / email:* when they held settings:read,
-- then remove settings:read so settings stays owner-only.

UPDATE api_keys
SET
  scopes = (
    SELECT ARRAY(
      SELECT DISTINCT s
      FROM unnest(
        scopes
        || CASE
          WHEN NOT ('chat:read' = ANY (scopes)) THEN ARRAY['chat:read']::text[]
          ELSE ARRAY[]::text[]
        END
        || CASE
          WHEN NOT ('chat:write' = ANY (scopes)) THEN ARRAY['chat:write']::text[]
          ELSE ARRAY[]::text[]
        END
        || CASE
          WHEN NOT ('email:read' = ANY (scopes)) THEN ARRAY['email:read']::text[]
          ELSE ARRAY[]::text[]
        END
        || CASE
          WHEN NOT ('email:send' = ANY (scopes)) THEN ARRAY['email:send']::text[]
          ELSE ARRAY[]::text[]
        END
      ) AS s
    )
  ),
  updated_at = NOW()
WHERE revoked_at IS NULL
  AND contact_id IS NULL
  AND NOT (
    cardinality(scopes) = 1
    AND scopes[1] IN ('carddav', 'tv.today_counts', 'applications')
  )
  AND (
    NOT ('chat:read' = ANY (scopes))
    OR NOT ('chat:write' = ANY (scopes))
    OR NOT ('email:read' = ANY (scopes))
    OR NOT ('email:send' = ANY (scopes))
  );

UPDATE api_keys
SET
  scopes = (
    SELECT ARRAY(
      SELECT DISTINCT s
      FROM unnest(
        array_remove(scopes, 'settings:read')
        || CASE
          WHEN NOT ('chat:read' = ANY (scopes)) THEN ARRAY['chat:read']::text[]
          ELSE ARRAY[]::text[]
        END
        || CASE
          WHEN NOT ('chat:write' = ANY (scopes)) THEN ARRAY['chat:write']::text[]
          ELSE ARRAY[]::text[]
        END
        || CASE
          WHEN NOT ('email:read' = ANY (scopes)) THEN ARRAY['email:read']::text[]
          ELSE ARRAY[]::text[]
        END
        || CASE
          WHEN NOT ('email:send' = ANY (scopes)) THEN ARRAY['email:send']::text[]
          ELSE ARRAY[]::text[]
        END
      ) AS s
      WHERE s IS NOT NULL AND s <> ''
    )
  ),
  updated_at = NOW()
WHERE revoked_at IS NULL
  AND contact_id IS NOT NULL
  AND 'settings:read' = ANY (scopes);
