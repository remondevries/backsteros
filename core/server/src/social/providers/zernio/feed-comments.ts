import { and, eq, isNull } from "drizzle-orm";

import type {
  SocialFeedComment,
  SocialFeedCommentsList,
  SocialFeedCommentsQuery,
} from "@backsteros/contracts";

import { db } from "../../../db/index.js";
import { socialAccounts } from "../../../db/schema.js";
import { ZernioApiError, ZernioClient } from "./client.js";
import { getZernioCredentials } from "./settings.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return null;
}

/**
 * Resolve the Zernio/platform post id we pass to `GET /v1/inbox/comments/{postId}`.
 * Feed ids are either `zernio-post:<mongoId>` or
 * `zernio-platform-post:<accountExternalId>:<platformPostId>`.
 */
export function resolveZernioCommentPostId(feedPostId: string): string | null {
  const trimmed = feedPostId.trim();
  if (trimmed.startsWith("zernio-post:")) {
    const id = trimmed.slice("zernio-post:".length).trim();
    return id || null;
  }
  if (trimmed.startsWith("zernio-platform-post:")) {
    const rest = trimmed.slice("zernio-platform-post:".length);
    const match = rest.match(/^([a-f0-9]{24}):(.+)$/i);
    const platformPostId = match?.[2]?.trim();
    return platformPostId || null;
  }
  return null;
}

function mapCommentRow(
  row: unknown,
  feedPostId: string,
): SocialFeedComment | null {
  const r = asRecord(row);
  if (!r) return null;
  const id = asString(r.id) ?? asString(r._id) ?? asString(r.commentId);
  if (!id) return null;
  const from = asRecord(r.from) ?? asRecord(r.author) ?? {};
  const authorName =
    asString(from.name) ??
    asString(from.displayName) ??
    asString(from.username) ??
    "LinkedIn";
  const authorHandle = (
    asString(from.username) ??
    asString(from.handle) ??
    authorName
  )
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .toLowerCase() || "linkedin";
  return {
    id,
    postId: feedPostId,
    authorName,
    authorHandle,
    authorAvatarUrl: asString(from.picture) ?? asString(from.profilePicture),
    authorVerified: Boolean(from.isOwner),
    body: asString(r.message) ?? asString(r.content) ?? asString(r.text) ?? "",
    createdAt:
      asString(r.createdTime) ??
      asString(r.createdAt) ??
      new Date().toISOString(),
    likeCount: asNumber(r.likeCount) ?? 0,
  };
}

/**
 * Live comments for a LinkedIn company-page Network post (Zernio inbox).
 * Personal LinkedIn comments are not available via the API.
 */
export async function listSocialFeedComments(
  workspaceId: string,
  query: SocialFeedCommentsQuery,
): Promise<SocialFeedCommentsList> {
  const empty = (): SocialFeedCommentsList => ({
    source: "live",
    platform: "linkedin",
    accountKind: "business",
    postId: query.postId,
    comments: [],
  });

  if (query.platform !== "linkedin" || query.accountKind !== "business") {
    return empty();
  }

  const zernioPostId = resolveZernioCommentPostId(query.postId);
  if (!zernioPostId) {
    throw new ZernioApiError(400, "", "Invalid live post id for comments.");
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

  const client = new ZernioClient({
    apiKey: creds.apiKey,
    rateKey: workspaceId,
  });
  const payload = await client.listComments(zernioPostId, {
    accountId: account.externalId,
    limit: 50,
  });
  const record = asRecord(payload);
  const rows = Array.isArray(record?.comments)
    ? (record!.comments as unknown[])
    : Array.isArray(record?.data)
      ? (record!.data as unknown[])
      : Array.isArray(payload)
        ? payload
        : [];

  const comments = rows
    .map((row) => mapCommentRow(row, query.postId))
    .filter((row): row is SocialFeedComment => row != null);

  return {
    source: "live",
    platform: "linkedin",
    accountKind: "business",
    postId: query.postId,
    comments,
  };
}
