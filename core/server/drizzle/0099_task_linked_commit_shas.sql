ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "linked_commit_shas" jsonb DEFAULT '[]'::jsonb NOT NULL;

UPDATE "tasks"
SET "linked_commit_shas" = jsonb_build_array("linked_commit_sha")
WHERE "linked_commit_sha" IS NOT NULL
  AND length(trim("linked_commit_sha")) > 0
  AND ("linked_commit_shas" IS NULL OR "linked_commit_shas" = '[]'::jsonb);

ALTER TABLE "tasks" DROP COLUMN IF EXISTS "linked_commit_sha";
