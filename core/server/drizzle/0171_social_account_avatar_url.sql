-- Provider profile picture URL (e.g. Zernio profilePicture) for Network avatars.
ALTER TABLE "social_accounts"
  ADD COLUMN IF NOT EXISTS "avatar_url" text;
