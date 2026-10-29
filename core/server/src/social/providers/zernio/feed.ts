import { and, eq, isNull } from "drizzle-orm";

import type {
  SocialFeedList,
  SocialFeedPost,
  SocialFeedQuery,
} from "@backsteros/contracts";

import { db } from "../../../db/index.js";
import { socialAccounts } from "../../../db/schema.js";
import { ZernioApiError, ZernioClient } from "./client.js";
import { getZernioCredentials } from "./settings.js";

function storedPlatformForFeed(query: SocialFeedQuery): string | null {
  if (query.platform === "linkedin") {
    return query.accountKind === "business"
      ? "linkedin_org"
      : "linkedin_personal";
  }
  // Live feed is LinkedIn-first for now.
  return null;
}

function stripZernioAccountPrefix(id: string): string {
  return id.startsWith("zernio-account:")
    ? id.slice("zernio-account:".length)
    : id;
}

function vanityFromProfileUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const match = new URL(url.trim()).pathname.match(
      /\/(?:in|company)\/([^/?#]+)/i,
    );
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]).replace(/\/+$/, "") || null;
  } catch {
    return null;
  }
}

function resolveAuthorHandle(input: {
  handle: string | null;
  displayName: string | null;
  url: string | null;
}): string {
  const display = input.displayName?.trim() ?? "";
  const handle = input.handle?.trim().replace(/^@+/, "") ?? "";
  if (
    handle &&
    !/\s/.test(handle) &&
    !handle.toLowerCase().startsWith("company/") &&
    handle.toLowerCase() !== display.toLowerCase()
  ) {
    return handle;
  }
  return vanityFromProfileUrl(input.url) || handle || "linkedin";
}

function sortFeedPostsNewestFirst(posts: SocialFeedPost[]): SocialFeedPost[] {
  return [...posts].sort((a, b) => {
    const aTime = Date.parse(a.createdAt) || 0;
    const bTime = Date.parse(b.createdAt) || 0;
    return bTime - aTime;
  });
}

/** LinkedIn share/UGC/activity URN from a feed card id or permalink. */
export function linkedInUrnFromFeedPost(post: {
  id: string;
  permalink?: string | null;
}): string | null {
  const fromPermalink = post.permalink?.match(
    /urn:li:(?:share|ugcPost|activity):[A-Za-z0-9_-]+/i,
  );
  if (fromPermalink?.[0]) return fromPermalink[0];
  if (post.id.startsWith("zernio-platform-post:")) {
    const rest = post.id.slice("zernio-platform-post:".length);
    const match = rest.match(/^([a-f0-9]{24}):(urn:li:(?:share|ugcPost|activity):[A-Za-z0-9_-]+)$/i);
    if (match?.[2]) return match[2];
  }
  return null;
}

async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, concurrency);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index]!);
      }
    }),
  );
}

/**
 * Attach LinkedIn save counts (and fill missing engagement) from per-post analytics.
 * Personal accounts get real saves; org analytics usually report 0 for saves.
 */
async function enrichLinkedInFeedEngagement(
  client: ZernioClient,
  accountExternalId: string,
  posts: SocialFeedPost[],
): Promise<void> {
  await mapPool(posts, 4, async (post) => {
    const urn = linkedInUrnFromFeedPost(post);
    if (!urn) return;
    try {
      const stats = await client.getLinkedInPostAnalytics(
        accountExternalId,
        urn,
      );
      post.saveCount = stats.saves;
      if (stats.likes > post.likeCount) post.likeCount = stats.likes;
      if (stats.comments > post.replyCount) post.replyCount = stats.comments;
      if (stats.shares > post.repostCount) post.repostCount = stats.shares;
    } catch {
      // Analytics is best-effort — keep listing counts when enrichment fails.
    }
  });
}

/** Stable keys so platform listing + Zernio authored rows collapse to one card. */
export function socialFeedDedupeKeys(input: {
  id?: string | null;
  platformPostId?: string | null;
  permalink?: string | null;
}): string[] {
  const keys = new Set<string>();
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) keys.add(trimmed.toLowerCase());
  };
  add(input.id);
  add(input.platformPostId);
  const permalink = input.permalink?.trim();
  if (permalink) {
    add(permalink.replace(/\/+$/, ""));
    const urn = permalink.match(
      /urn:li:(?:share|ugcPost|activity):[A-Za-z0-9_-]+/i,
    );
    if (urn?.[0]) add(urn[0]);
  }
  const platformId = input.platformPostId?.trim();
  if (platformId?.startsWith("urn:li:")) add(platformId);
  return [...keys];
}

/**
 * Live Network inbox posts for a connected account (Zernio → platform).
 * LinkedIn first; other platforms return an empty live list until wired.
 *
 * LinkedIn personal profiles: the platform listing API usually returns []
 * because LinkedIn does not grant `r_member_social`. We still merge posts
 * authored through Zernio so composer publishes show up in Inbox.
 */
export async function listSocialFeedPosts(
  workspaceId: string,
  query: SocialFeedQuery,
): Promise<SocialFeedList> {
  const storedPlatform = storedPlatformForFeed(query);
  if (!storedPlatform) {
    return {
      source: "live",
      platform: query.platform,
      accountKind: query.accountKind,
      posts: [],
    };
  }

  const creds = await getZernioCredentials(workspaceId);
  if (!creds.apiKey) {
    throw new ZernioApiError(
      400,
      "",
      "Zernio API key is not configured — add it in Settings → Social.",
    );
  }

  const [account] = await db
    .select({
      id: socialAccounts.id,
      externalId: socialAccounts.externalId,
      handle: socialAccounts.handle,
      displayName: socialAccounts.displayName,
      url: socialAccounts.url,
      avatarUrl: socialAccounts.avatarUrl,
      followersCount: socialAccounts.followersCount,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.provider, "zernio"),
        eq(socialAccounts.platform, storedPlatform),
        isNull(socialAccounts.deletedAt),
      ),
    )
    .limit(1);

  if (!account) {
    return {
      source: "live",
      platform: query.platform,
      accountKind: query.accountKind,
      posts: [],
    };
  }

  const client = new ZernioClient({
    apiKey: creds.apiKey,
    rateKey: workspaceId,
  });
  const externalId = stripZernioAccountPrefix(account.externalId || account.id);
  const authorName =
    account.displayName?.trim() || account.handle?.trim() || "LinkedIn";
  const authorHandle = resolveAuthorHandle({
    handle: account.handle,
    displayName: account.displayName,
    url: account.url,
  });
  const authorAvatarUrl = account.avatarUrl?.trim() || null;
  const authorFollowersCount = account.followersCount;
  const authorFields = {
    authorName,
    authorHandle,
    authorAvatarUrl,
    authorFollowersCount,
    authorVerified: true as const,
  };

  const [platformPosts, authoredPosts] = await Promise.all([
    client.listAccountPosts(externalId),
    client.listZernioPosts({
      accountId: externalId,
      status: "published",
      limit: 25,
    }),
  ]);

  const posts: SocialFeedPost[] = [];
  const seen = new Set<string>();

  const remember = (keys: string[]): boolean => {
    if (keys.some((key) => seen.has(key))) return false;
    for (const key of keys) seen.add(key);
    return true;
  };

  // Prefer Zernio authored ids when a platform row matches — edit/delete need
  // the Zernio post id, while engagement still comes from the platform row.
  const authoredByPlatformPostId = new Map<
    string,
    (typeof authoredPosts)[number]
  >();
  for (const post of authoredPosts) {
    const status = (post.status ?? "").toLowerCase();
    if (status && status !== "published" && status !== "success") continue;
    const platformPostId = post.platformPostId?.trim();
    if (platformPostId) authoredByPlatformPostId.set(platformPostId, post);
  }

  for (const post of platformPosts) {
    const keys = socialFeedDedupeKeys({
      id: post.id,
      platformPostId: post.id,
      permalink: post.permalink,
    });
    if (!remember(keys)) continue;
    const authored = authoredByPlatformPostId.get(post.id);
    posts.push({
      id: authored
        ? `zernio-post:${authored.id}`
        : `zernio-platform-post:${externalId}:${post.id}`,
      ...authorFields,
      platform: query.platform,
      accountKind: query.accountKind,
      body: post.message,
      imageUrl: post.picture,
      imageAlt: post.picture ? "Post media" : null,
      createdAt: post.createdTime ?? new Date().toISOString(),
      replyCount: post.commentCount ?? 0,
      repostCount: post.shareCount ?? 0,
      likeCount: post.reactionCount ?? post.likeCount ?? 0,
      saveCount: post.saveCount ?? 0,
      permalink: post.permalink,
      feed: "both" as const,
    });
  }

  for (const post of authoredPosts) {
    const status = (post.status ?? "").toLowerCase();
    if (status && status !== "published" && status !== "success") continue;
    const keys = socialFeedDedupeKeys({
      id: post.id,
      platformPostId: post.platformPostId,
      permalink: post.permalink,
    });
    // Prefer live platform rows when both exist (engagement counts).
    if (!remember(keys)) continue;
    posts.push({
      id: `zernio-post:${post.id}`,
      ...authorFields,
      platform: query.platform,
      accountKind: query.accountKind,
      body: post.message,
      imageUrl: post.picture,
      imageAlt: post.picture ? "Post media" : null,
      createdAt: post.createdTime ?? new Date().toISOString(),
      replyCount: 0,
      repostCount: 0,
      likeCount: 0,
      saveCount: 0,
      permalink: post.permalink,
      feed: "both" as const,
    });
  }

  if (query.platform === "linkedin" && posts.length > 0) {
    await enrichLinkedInFeedEngagement(client, externalId, posts);
  }

  return {
    source: "live",
    platform: query.platform,
    accountKind: query.accountKind,
    posts: sortFeedPostsNewestFirst(posts),
  };
}
