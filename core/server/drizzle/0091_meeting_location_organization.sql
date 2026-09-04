ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "location_organization_id" text REFERENCES "organizations"("id") ON DELETE SET NULL;
