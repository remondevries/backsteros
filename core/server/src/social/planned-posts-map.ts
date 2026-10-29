import type {
  SocialPlannedPost,
  SocialPlannedPostAccountKind,
  SocialPlannedPostPlatform,
} from "@backsteros/contracts";

export const LOCAL_PLANNED_PROVIDER = "local";

const PLATFORM_SET = new Set<string>([
  "facebook",
  "instagram",
  "x",
  "linkedin",
  "dev-null",
]);

export function isSocialPlannedPlatform(
  value: string,
): value is SocialPlannedPostPlatform {
  return PLATFORM_SET.has(value);
}

export function isSocialPlannedAccountKind(
  value: string,
): value is SocialPlannedPostAccountKind {
  return value === "personal" || value === "business";
}

export function normalizeSocialPlannedPlatforms(
  platforms: readonly string[],
): SocialPlannedPostPlatform[] {
  const out: SocialPlannedPostPlatform[] = [];
  for (const entry of platforms) {
    if (!isSocialPlannedPlatform(entry)) continue;
    if (!out.includes(entry)) out.push(entry);
  }
  return out;
}

/** Minimal row shape for mapping — avoids pulling the DB client into unit tests. */
export type SocialPlannedPostRow = {
  id: string;
  provider: string;
  platform: string;
  text: string;
  accountKind: string | null;
  targetPlatforms: string[] | null;
  scheduledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export function rowToSocialPlannedPost(
  row: SocialPlannedPostRow,
): SocialPlannedPost | null {
  if (row.provider !== LOCAL_PLANNED_PROVIDER) return null;
  if (row.deletedAt) return null;
  const accountKind = row.accountKind;
  if (!accountKind || !isSocialPlannedAccountKind(accountKind)) return null;
  const platforms = normalizeSocialPlannedPlatforms(
    Array.isArray(row.targetPlatforms) ? row.targetPlatforms : [],
  );
  if (platforms.length === 0 && isSocialPlannedPlatform(row.platform)) {
    platforms.push(row.platform);
  }
  if (platforms.length === 0) return null;
  const scheduledAt = row.scheduledAt ? row.scheduledAt.toISOString() : null;
  const status = scheduledAt ? "scheduled" : "draft";
  return {
    id: row.id,
    body: row.text,
    accountKind,
    platforms,
    scheduledAt,
    status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
