import { and, desc, eq, isNull } from "drizzle-orm";

import type {
  CreateSocialPlannedPostInput,
  SocialPlannedPost,
  UpdateSocialPlannedPostInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { socialPosts } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  parseStoredSocialPostMedia,
  readSocialPostMediaBytes,
  storeSocialPostMediaUploads,
  type StoredSocialPostMedia,
} from "./planned-post-media.js";
import {
  engagementWithZernioPostId,
  parseZernioPostIdFromEngagement,
  plannedPostTargetsLinkedIn,
  syncPlannedPostScheduleToZernio,
} from "./providers/zernio/planned-schedule.js";
import {
  LOCAL_PLANNED_PROVIDER,
  normalizeSocialPlannedPlatforms,
  rowToSocialPlannedPost,
} from "./planned-posts-map.js";

export {
  LOCAL_PLANNED_PROVIDER,
  rowToSocialPlannedPost,
} from "./planned-posts-map.js";

type PlannedRow = typeof socialPosts.$inferSelect;

async function loadPlannedRow(
  workspaceId: string,
  id: string,
): Promise<PlannedRow | null> {
  const [row] = await db
    .select()
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.workspaceId, workspaceId),
        eq(socialPosts.id, id),
        eq(socialPosts.provider, LOCAL_PLANNED_PROVIDER),
        isNull(socialPosts.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function loadStoredMedia(
  workspaceId: string,
  id: string,
): Promise<StoredSocialPostMedia[]> {
  const row = await loadPlannedRow(workspaceId, id);
  return parseStoredSocialPostMedia(row?.media);
}

function mergeLinkedInExtras(
  engagement: unknown,
  extras: {
    firstComment?: string | null;
    poll?: SocialPlannedPost["poll"];
    geoCountries?: string[] | null;
  },
): Record<string, unknown> {
  const base =
    engagement && typeof engagement === "object" && !Array.isArray(engagement)
      ? { ...(engagement as Record<string, unknown>) }
      : {};
  if (extras.firstComment !== undefined) {
    if (extras.firstComment?.trim()) {
      base.firstComment = extras.firstComment.trim();
    } else {
      delete base.firstComment;
    }
  }
  if (extras.poll !== undefined) {
    if (extras.poll) {
      base.poll = extras.poll;
    } else {
      delete base.poll;
    }
  }
  if (extras.geoCountries !== undefined) {
    if (extras.geoCountries?.length) {
      base.geoCountries = extras.geoCountries.map((c) => c.toUpperCase());
    } else {
      delete base.geoCountries;
    }
  }
  return base;
}

async function syncAndBuildEngagement(input: {
  workspaceId: string;
  postId: string;
  body: string;
  accountKind: SocialPlannedPost["accountKind"];
  platforms: SocialPlannedPost["platforms"];
  media: readonly StoredSocialPostMedia[];
  scheduledAt: Date | null;
  engagement: unknown;
  firstComment?: string | null;
  poll?: SocialPlannedPost["poll"];
  geoCountries?: string[] | null;
}): Promise<Record<string, unknown> | null> {
  const withExtras = mergeLinkedInExtras(input.engagement, {
    firstComment: input.firstComment,
    poll: input.poll,
    geoCountries: input.geoCountries,
  });
  const prevZernioId = parseZernioPostIdFromEngagement(withExtras);
  const needsRemote =
    plannedPostTargetsLinkedIn(input.platforms) || Boolean(prevZernioId);
  if (!needsRemote) {
    return engagementWithZernioPostId(withExtras, null);
  }
  const nextZernioId = await syncPlannedPostScheduleToZernio({
    workspaceId: input.workspaceId,
    postId: input.postId,
    body: input.body,
    accountKind: input.accountKind,
    platforms: input.platforms,
    media: input.media,
    scheduledAt: input.scheduledAt ? input.scheduledAt.toISOString() : null,
    zernioPostId: prevZernioId,
    firstComment:
      typeof withExtras.firstComment === "string"
        ? withExtras.firstComment
        : null,
    poll:
      withExtras.poll && typeof withExtras.poll === "object"
        ? (withExtras.poll as SocialPlannedPost["poll"])
        : null,
    geoCountries: Array.isArray(withExtras.geoCountries)
      ? (withExtras.geoCountries as string[])
      : null,
  });
  return engagementWithZernioPostId(withExtras, nextZernioId);
}

export async function listSocialPlannedPosts(
  workspaceId: string,
): Promise<SocialPlannedPost[]> {
  const rows = await db
    .select()
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.workspaceId, workspaceId),
        eq(socialPosts.provider, LOCAL_PLANNED_PROVIDER),
        isNull(socialPosts.deletedAt),
      ),
    )
    .orderBy(desc(socialPosts.updatedAt));

  const posts: SocialPlannedPost[] = [];
  for (const row of rows) {
    const mapped = rowToSocialPlannedPost(row);
    if (mapped) posts.push(mapped);
  }
  return posts;
}

export async function getSocialPlannedPost(
  workspaceId: string,
  id: string,
): Promise<SocialPlannedPost | null> {
  const row = await loadPlannedRow(workspaceId, id);
  if (!row) return null;
  return rowToSocialPlannedPost(row);
}

export async function createSocialPlannedPost(
  workspaceId: string,
  input: CreateSocialPlannedPostInput,
): Promise<SocialPlannedPost> {
  const platforms = normalizeSocialPlannedPlatforms(input.platforms);
  if (platforms.length === 0) {
    throw new Error("At least one platform is required");
  }
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Invalid scheduledAt");
  }
  const id = newId();
  const now = new Date();
  const primary = platforms[0]!;
  const media = await storeSocialPostMediaUploads(
    id,
    input.mediaUploads ?? [],
  );

  // Schedule with Zernio before inserting when the create already has a time.
  const engagement = await syncAndBuildEngagement({
    workspaceId,
    postId: id,
    body: input.body.trim(),
    accountKind: input.accountKind,
    platforms,
    media,
    scheduledAt,
    engagement: null,
    firstComment: input.firstComment ?? null,
    poll: input.poll ?? null,
    geoCountries: input.geoCountries ?? null,
  });

  await db.insert(socialPosts).values({
    id,
    workspaceId,
    accountId: null,
    platform: primary,
    provider: LOCAL_PLANNED_PROVIDER,
    externalId: id,
    text: input.body.trim(),
    media,
    status: scheduledAt ? "scheduled" : "draft",
    scheduledAt,
    engagement,
    accountKind: input.accountKind,
    targetPlatforms: platforms,
    createdAt: now,
    updatedAt: now,
  });
  const created = await getSocialPlannedPost(workspaceId, id);
  if (!created) throw new Error("Failed to create planned post");
  return created;
}

export async function updateSocialPlannedPost(
  workspaceId: string,
  id: string,
  patch: UpdateSocialPlannedPostInput,
): Promise<SocialPlannedPost | null> {
  const row = await loadPlannedRow(workspaceId, id);
  if (!row) return null;
  const existing = rowToSocialPlannedPost(row);
  if (!existing) return null;

  const platforms =
    patch.platforms !== undefined
      ? normalizeSocialPlannedPlatforms(patch.platforms)
      : existing.platforms;
  if (platforms.length === 0) {
    throw new Error("At least one platform is required");
  }

  let scheduledAt: Date | null;
  if (patch.scheduledAt === undefined) {
    scheduledAt = existing.scheduledAt ? new Date(existing.scheduledAt) : null;
  } else if (patch.scheduledAt === null) {
    scheduledAt = null;
  } else {
    scheduledAt = new Date(patch.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new Error("Invalid scheduledAt");
    }
  }

  const body =
    patch.body !== undefined ? patch.body.trim() : existing.body;
  const accountKind = patch.accountKind ?? existing.accountKind;
  const now = new Date();

  let media: StoredSocialPostMedia[] = parseStoredSocialPostMedia(row.media);
  if (patch.mediaUploads?.length) {
    media = await storeSocialPostMediaUploads(id, patch.mediaUploads, media);
  }

  const firstComment =
    patch.firstComment !== undefined
      ? patch.firstComment
      : existing.firstComment ?? null;
  const poll =
    patch.poll !== undefined ? patch.poll : existing.poll ?? null;
  const geoCountries =
    patch.geoCountries !== undefined
      ? patch.geoCountries
      : existing.geoCountries ?? null;

  if (!body && media.length === 0 && !poll) {
    throw new Error("Body, media, or poll is required");
  }

  const scheduleTouched =
    patch.scheduledAt !== undefined ||
    patch.body !== undefined ||
    patch.platforms !== undefined ||
    patch.accountKind !== undefined ||
    Boolean(patch.mediaUploads?.length) ||
    patch.firstComment !== undefined ||
    patch.poll !== undefined ||
    patch.geoCountries !== undefined;

  let engagement = row.engagement as Record<string, unknown> | null;
  if (scheduleTouched) {
    engagement = await syncAndBuildEngagement({
      workspaceId,
      postId: id,
      body,
      accountKind,
      platforms,
      media,
      scheduledAt,
      engagement: row.engagement,
      firstComment,
      poll,
      geoCountries,
    });
  }

  await db
    .update(socialPosts)
    .set({
      text: body,
      platform: platforms[0]!,
      accountKind,
      targetPlatforms: platforms,
      scheduledAt,
      status: scheduledAt ? "scheduled" : "draft",
      media,
      engagement,
      updatedAt: now,
    })
    .where(
      and(
        eq(socialPosts.workspaceId, workspaceId),
        eq(socialPosts.id, id),
        eq(socialPosts.provider, LOCAL_PLANNED_PROVIDER),
        isNull(socialPosts.deletedAt),
      ),
    );

  return getSocialPlannedPost(workspaceId, id);
}

export async function deleteSocialPlannedPost(
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const row = await loadPlannedRow(workspaceId, id);
  if (!row) return false;
  const existing = rowToSocialPlannedPost(row);
  if (!existing) return false;

  const zernioPostId = parseZernioPostIdFromEngagement(row.engagement);
  if (zernioPostId || plannedPostTargetsLinkedIn(existing.platforms)) {
    await syncPlannedPostScheduleToZernio({
      workspaceId,
      postId: id,
      body: existing.body,
      accountKind: existing.accountKind,
      platforms: existing.platforms,
      media: parseStoredSocialPostMedia(row.media),
      scheduledAt: null,
      zernioPostId,
    });
  }

  const now = new Date();
  await db
    .update(socialPosts)
    .set({
      deletedAt: now,
      updatedAt: now,
      engagement: engagementWithZernioPostId(row.engagement, null),
      scheduledAt: null,
      status: "draft",
    })
    .where(
      and(
        eq(socialPosts.workspaceId, workspaceId),
        eq(socialPosts.id, id),
        eq(socialPosts.provider, LOCAL_PLANNED_PROVIDER),
        isNull(socialPosts.deletedAt),
      ),
    );
  return true;
}

export async function getSocialPlannedPostMediaBytes(
  workspaceId: string,
  postId: string,
  mediaId: string,
): Promise<{ bytes: Uint8Array; contentType: string; filename: string | null } | null> {
  const existing = await getSocialPlannedPost(workspaceId, postId);
  if (!existing) return null;
  const stored = await loadStoredMedia(workspaceId, postId);
  return readSocialPostMediaBytes(stored, mediaId);
}
