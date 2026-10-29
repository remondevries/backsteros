-- Provider follower count (e.g. Zernio followersCount) for Network Discover.
ALTER TABLE "social_accounts"
  ADD COLUMN IF NOT EXISTS "followers_count" integer;
