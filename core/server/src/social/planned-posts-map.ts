import type {
  LinkedInPoll,
  SocialPlannedPost,
  SocialPlannedPostAccountKind,
  SocialPlannedPostPlatform,
} from "@backsteros/contracts";

import {
  parseStoredSocialPostMedia,
  toPublicSocialPostMedia,
} from "./planned-post-media.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseLinkedInExtras(engagement: unknown): {
  firstComment: string | null;
  poll: LinkedInPoll | null;
  geoCountries: string[] | null;
} {
  const root = asRecord(engagement);
  if (!root) {
    return { firstComment: null, poll: null, geoCountries: null };
  }
  const firstComment =
    typeof root.firstComment === "string" && root.firstComment.trim()
      ? root.firstComment.trim()
      : null;
  let poll: LinkedInPoll | null = null;
  const pollRaw = asRecord(root.poll);
  if (pollRaw) {
    const question =
      typeof pollRaw.question === "string" ? pollRaw.question.trim() : "";
    const options = Array.isArray(pollRaw.options)
      ? pollRaw.options
          .filter((o): o is string => typeof o === "string")
          .map((o) => o.trim())
          .filter(Boolean)
      : [];
    const duration =
      pollRaw.duration === "ONE_DAY" ||
      pollRaw.duration === "THREE_DAYS" ||
      pollRaw.duration === "SEVEN_DAYS" ||
      pollRaw.duration === "FOURTEEN_DAYS"
        ? pollRaw.duration
        : "SEVEN_DAYS";
    if (question && options.length >= 2) {
      poll = { question, options: options.slice(0, 4), duration };
    }
  }
  const geoCountries = Array.isArray(root.geoCountries)
    ? root.geoCountries
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length === 2)
    : null;
  return {
    firstComment,
    poll,
    geoCountries: geoCountries?.length ? geoCountries : null,
  };
}

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
  media: unknown;
  accountKind: string | null;
  targetPlatforms: string[] | null;
  scheduledAt: Date | null;
  engagement?: unknown;
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
  const extras = parseLinkedInExtras(row.engagement);
  return {
    id: row.id,
    body: row.text,
    accountKind,
    platforms,
    media: toPublicSocialPostMedia(parseStoredSocialPostMedia(row.media)),
    scheduledAt,
    status,
    firstComment: extras.firstComment,
    poll: extras.poll,
    geoCountries: extras.geoCountries,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
