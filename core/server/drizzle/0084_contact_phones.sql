ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phones" jsonb DEFAULT '[]'::jsonb NOT NULL;

-- Seed labeled rows from legacy primary `phone` when the array is still empty.
UPDATE "contacts"
SET "phones" = jsonb_build_array(
  jsonb_build_object('label', 'personal', 'number', "phone")
)
WHERE coalesce(trim("phone"), '') <> ''
  AND ("phones" IS NULL OR "phones" = '[]'::jsonb);
