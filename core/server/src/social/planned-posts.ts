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
  LOCAL_PLANNED_PROVIDER,
  normalizeSocialPlannedPlatforms,
  rowToSocialPlannedPost,
} from "./planned-posts-map.js";

export {
  LOCAL_PLANNED_PROVIDER,
  rowToSocialPlannedPost,
} from "./planned-posts-map.js";

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
  await db.insert(socialPosts).values({
    id,
    workspaceId,
    accountId: null,
    platform: primary,
    provider: LOCAL_PLANNED_PROVIDER,
    externalId: id,
    text: input.body,
    media: [],
    status: scheduledAt ? "scheduled" : "draft",
    scheduledAt,
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
  const existing = await getSocialPlannedPost(workspaceId, id);
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

  const body = patch.body ?? existing.body;
  const accountKind = patch.accountKind ?? existing.accountKind;
  const now = new Date();

  await db
    .update(socialPosts)
    .set({
      text: body,
      platform: platforms[0]!,
      accountKind,
      targetPlatforms: platforms,
      scheduledAt,
      status: scheduledAt ? "scheduled" : "draft",
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
  const existing = await getSocialPlannedPost(workspaceId, id);
  if (!existing) return false;
  const now = new Date();
  await db
    .update(socialPosts)
    .set({ deletedAt: now, updatedAt: now })
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
