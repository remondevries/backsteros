import { and, eq, isNull } from "drizzle-orm";

import type {
  SocialFeedPostReaction,
  SocialFeedPostReactionsList,
  SocialFeedPostReactionsQuery,
} from "@backsteros/contracts";

import { db } from "../../../db/index.js";
import { socialAccounts } from "../../../db/schema.js";
import { resolveZernioCommentPostId } from "./feed-comments.js";
import { ZernioApiError, ZernioClient } from "./client.js";
import { getZernioCredentials } from "./settings.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function extractArray(
  payload: unknown,
  keys: string[],
): unknown[] {
  const root = asRecord(payload);
  if (!root) return [];
  for (const key of keys) {
    const value = root[key];
    if (Array.isArray(value)) return value;
  }
  if (Array.isArray(payload)) return payload;
  return [];
}

/**
 * Turn a feed post id into a LinkedIn URN for the reactions endpoint.
 * Platform posts already carry `urn:li:…`; Zernio mongo ids need the feed
 * permalink urn when available — callers pass the resolved inbox post id.
 */
function toLinkedInUrn(postIdOrUrn: string): string | null {
  const trimmed = postIdOrUrn.trim();
  if (/^urn:li:(share|ugcPost|activity):\d+$/i.test(trimmed)) {
    return trimmed;
  }
  // zernio-platform-post:<accountId>:<platformPostId>
  if (trimmed.startsWith("zernio-platform-post:")) {
    const rest = trimmed.slice("zernio-platform-post:".length);
    const match = rest.match(/^[a-f0-9]{24}:(.+)$/i);
    const platformPostId = match?.[1]?.trim();
    if (platformPostId && /^urn:li:/i.test(platformPostId)) {
      return platformPostId;
    }
    if (platformPostId && /^\d+$/.test(platformPostId)) {
      return `urn:li:share:${platformPostId}`;
    }
    return platformPostId || null;
  }
  const resolved = resolveZernioCommentPostId(trimmed);
  if (resolved && /^urn:li:/i.test(resolved)) return resolved;
  if (resolved && /^\d+$/.test(resolved)) return `urn:li:share:${resolved}`;
  return resolved;
}

function mapReaction(row: unknown, index: number): SocialFeedPostReaction | null {
  const r = asRecord(row);
  if (!r) return null;
  const reactor =
    asRecord(r.reactor) ??
    asRecord(r.actor) ??
    asRecord(r.profile) ??
    asRecord(r.author) ??
    {};
  const name =
    asString(reactor.name) ??
    asString(reactor.displayName) ??
    asString(r.name) ??
    "LinkedIn member";
  const reactionType =
    asString(r.reactionType) ??
    asString(r.type) ??
    asString(r.reaction) ??
    "LIKE";
  const id =
    asString(r.id) ??
    asString(reactor.id) ??
    asString(reactor.profileUrl) ??
    `${reactionType}:${name}:${index}`;
  return {
    id,
    reactionType,
    name,
    headline:
      asString(reactor.headline) ??
      asString(reactor.jobTitle) ??
      asString(r.headline) ??
      null,
    profileUrl:
      asString(reactor.profileUrl) ??
      asString(reactor.url) ??
      asString(r.profileUrl) ??
      null,
    avatarUrl:
      asString(reactor.profilePicture) ??
      asString(reactor.picture) ??
      asString(reactor.avatarUrl) ??
      asString(r.avatarUrl) ??
      null,
  };
}

/** List reactors on a LinkedIn company-page post (org analytics). */
export async function listSocialFeedPostReactions(
  workspaceId: string,
  query: SocialFeedPostReactionsQuery,
): Promise<SocialFeedPostReactionsList> {
  const empty = (): SocialFeedPostReactionsList => ({
    source: "live",
    platform: "linkedin",
    accountKind: "business",
    postId: query.postId,
    reactions: [],
  });

  if (query.platform !== "linkedin" || query.accountKind !== "business") {
    return empty();
  }

  const urn = toLinkedInUrn(query.postId);
  if (!urn) {
    throw new ZernioApiError(400, "", "Invalid live post id for reactions.");
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
      externalId: socialAccounts.externalId,
      disconnected: socialAccounts.disconnected,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.provider, "zernio"),
        eq(socialAccounts.platform, "linkedin_org"),
        isNull(socialAccounts.deletedAt),
      ),
    )
    .limit(1);

  if (!account?.externalId) {
    return empty();
  }
  if (account.disconnected) {
    throw new ZernioApiError(
      400,
      "",
      "LinkedIn company page is disconnected — reconnect in Settings → Social.",
    );
  }

  const client = new ZernioClient({
    apiKey: creds.apiKey,
    rateKey: workspaceId,
  });
  const payload = await client.getLinkedInPostReactions(
    account.externalId,
    urn,
    { limit: query.limit ?? 25 },
  );
  const reactions = extractArray(payload, ["reactions", "data", "items"])
    .map((row, index) => mapReaction(row, index))
    .filter((row): row is SocialFeedPostReaction => row != null);

  return {
    source: "live",
    platform: "linkedin",
    accountKind: "business",
    postId: query.postId,
    reactions,
  };
}
