-- Provider profile/about text (e.g. Zernio metadata.profileData.bio) for Network Discover.
ALTER TABLE "social_accounts"
  ADD COLUMN IF NOT EXISTS "bio" text;
