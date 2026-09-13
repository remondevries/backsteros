ALTER TABLE "space_publish_settings" ADD COLUMN IF NOT EXISTS "seo_meta" jsonb DEFAULT '{}'::jsonb NOT NULL;
