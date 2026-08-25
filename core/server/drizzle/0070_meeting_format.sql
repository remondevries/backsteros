ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "format" text NOT NULL DEFAULT 'video_call';
