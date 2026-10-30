import { and, eq, isNull } from "drizzle-orm";

import type {
  CreateSocialFeedCommentInput,
  CreateSocialFeedCommentResult,
  DeleteSocialFeedCommentInput,
  DeleteSocialFeedCommentResult,
  SocialFeedComment,
} from "@backsteros/contracts";

import { db } from "../../../db/index.js";
import { socialAccounts } from "../../../db/schema.js";
import { ZernioApiError, ZernioClient } from "./client.js";
import { resolveZernioCommentPostId } from "./feed-comments.js";
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

function mapCommentRow(
  row: unknown,
  feedPostId: string,
  fallbackBody: string,
): SocialFeedComment | null {
  const r = asRecord(row);
  if (!r) return null;
  const nested =
    asRecord(r.comment) ?? asRecord(r.data) ?? asRecord(r.result) ?? r;
  const id =
    asString(nested.id) ??
    asString(nested._id) ??
    asString(nested.commentId) ??
    asString(r.id) ??
    asString(r._id);
  if (!id) return null;
  const from =
    asRecord(nested.from) ??
    asRecord(nested.author) ??
    asRecord(r.from) ??
    asRecord(r.author) ??
    {};
  const authorName =
    asString(from.name) ??
    asString(from.displayName) ??
    asString(from.username) ??
    "LinkedIn";
  const authorHandle =
    (
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
    body:
      asString(nested.message) ??
      asString(nested.content) ??
      asString(nested.text) ??
      asString(r.message) ??
      fallbackBody,
    createdAt:
      asString(nested.createdTime) ??
      asString(nested.createdAt) ??
      asString(r.createdTime) ??
      new Date().toISOString(),
    likeCount: asNumber(nested.likeCount) ?? asNumber(r.likeCount) ?? 0,
  };
}

async function requireOrgAccount(
  workspaceId: string,
): Promise<{ externalId: string }> {
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
    throw new ZernioApiError(
      400,
      "",
      "No LinkedIn company page connected — sync accounts in Settings → Social.",
    );
  }
  if (account.disconnected) {
    throw new ZernioApiError(
      400,
      "",
      "LinkedIn company page is disconnected — reconnect in Settings → Social.",
    );
  }
  return { externalId: account.externalId };
}

/** Comment or reply on a LinkedIn company-page post (Zernio inbox). */
export async function createSocialFeedComment(
  workspaceId: string,
  input: CreateSocialFeedCommentInput,
): Promise<CreateSocialFeedCommentResult> {
  if (input.platform !== "linkedin" || input.accountKind !== "business") {
    throw new ZernioApiError(
      400,
      "",
      "Comments can only be posted on LinkedIn company-page posts.",
    );
  }
  const body = input.body.trim();
  if (!body) {
    throw new ZernioApiError(400, "", "Comment text is required.");
  }

  const zernioPostId = resolveZernioCommentPostId(input.postId);
  if (!zernioPostId) {
    throw new ZernioApiError(400, "", "Invalid live post id for comments.");
  }

  const account = await requireOrgAccount(workspaceId);
  const creds = await getZernioCredentials(workspaceId);
  const client = new ZernioClient({
    apiKey: creds.apiKey!,
    rateKey: workspaceId,
  });

  const parentCommentId = input.parentCommentId?.trim() || null;
  const payload = await client.replyToComment(zernioPostId, {
    accountId: account.externalId,
    message: body,
    ...(parentCommentId ? { commentId: parentCommentId } : {}),
  });

  const mapped = mapCommentRow(payload, input.postId, body);
  if (mapped) return mapped;

  return {
    id: `pending:${Date.now()}`,
    postId: input.postId,
    authorName: "You",
    authorHandle: "me",
    authorVerified: true,
    body,
    createdAt: new Date().toISOString(),
    likeCount: 0,
  };
}

/** Delete a LinkedIn company-page comment via Zernio. */
export async function deleteSocialFeedComment(
  workspaceId: string,
  input: DeleteSocialFeedCommentInput,
): Promise<DeleteSocialFeedCommentResult> {
  if (input.platform !== "linkedin" || input.accountKind !== "business") {
    throw new ZernioApiError(
      400,
      "",
      "Comments can only be deleted on LinkedIn company-page posts.",
    );
  }

  const zernioPostId = resolveZernioCommentPostId(input.postId);
  if (!zernioPostId) {
    throw new ZernioApiError(400, "", "Invalid live post id for comments.");
  }
  const commentId = input.commentId.trim();
  if (!commentId) {
    throw new ZernioApiError(400, "", "Comment id is required.");
  }

  const account = await requireOrgAccount(workspaceId);
  const creds = await getZernioCredentials(workspaceId);
  const client = new ZernioClient({
    apiKey: creds.apiKey!,
    rateKey: workspaceId,
  });

  await client.deleteComment(zernioPostId, {
    accountId: account.externalId,
    commentId,
  });

  return { deleted: true };
}
