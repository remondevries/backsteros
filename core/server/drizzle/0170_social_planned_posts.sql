-- Local Network Planned posts: nullable account, multi-platform targets, scopes.

ALTER TABLE "social_posts" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "account_kind" text;
--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "target_platforms" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint

-- Access keys (no contact, non-door): append social:read / social:write when missing.
UPDATE api_keys
SET
  scopes = (
    SELECT ARRAY(
      SELECT DISTINCT s
      FROM unnest(
        scopes
        || CASE
          WHEN NOT ('social:read' = ANY (scopes)) THEN ARRAY['social:read']::text[]
          ELSE ARRAY[]::text[]
        END
        || CASE
          WHEN NOT ('social:write' = ANY (scopes)) THEN ARRAY['social:write']::text[]
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
    NOT ('social:read' = ANY (scopes))
    OR NOT ('social:write' = ANY (scopes))
  );
--> statement-breakpoint

-- Agent keys: append social scopes (no settings required).
UPDATE api_keys
SET
  scopes = (
    SELECT ARRAY(
      SELECT DISTINCT s
      FROM unnest(
        scopes
        || CASE
          WHEN NOT ('social:read' = ANY (scopes)) THEN ARRAY['social:read']::text[]
          ELSE ARRAY[]::text[]
        END
        || CASE
          WHEN NOT ('social:write' = ANY (scopes)) THEN ARRAY['social:write']::text[]
          ELSE ARRAY[]::text[]
        END
      ) AS s
      WHERE s IS NOT NULL AND s <> ''
    )
  ),
  updated_at = NOW()
WHERE revoked_at IS NULL
  AND contact_id IS NOT NULL
  AND (
    NOT ('social:read' = ANY (scopes))
    OR NOT ('social:write' = ANY (scopes))
  );
