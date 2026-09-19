-- Coerce statuses to kind-specific sets:
-- update/maintenance: internal | published
-- incident: open | resolved
UPDATE "project_updates" SET "status" = CASE
  WHEN "kind" = 'incident' AND "status" IN ('published', 'resolved') THEN 'resolved'
  WHEN "kind" = 'incident' THEN 'open'
  WHEN "kind" <> 'incident' AND "status" IN ('resolved', 'published') THEN 'published'
  ELSE 'internal'
END;
