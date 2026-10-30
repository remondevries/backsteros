import { and, eq, isNull } from "drizzle-orm";

import type {
  LikeSocialFeedCommentInput,
  LikeSocialFeedCommentResult,
  UnlikeSocialFeedCommentInput,
  UnlikeSocialFeedCommentResult,
} from "@backsteros/contracts";

import { db } from "../../../db/index.js";
import { socialAccounts } from "../../../db/schema.js";
import { resolveZernioCommentPostId } from "./feed-comments.js";
import { ZernioApiError, ZernioClient } from "./client.js";
import { likeCommentReplacingConflict } from "./feed-like-replace.js";
import { getZernioCredentials } from "./settings.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
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

/** React to a LinkedIn company-page comment via Zernio inbox. */
export async function likeSocialFeedComment(
  workspaceId: string,
  input: LikeSocialFeedCommentInput,
): Promise<LikeSocialFeedCommentResult> {
  if (input.platform !== "linkedin" || input.accountKind !== "business") {
    throw new ZernioApiError(
      400,
      "",
      "Comment reactions are only available on LinkedIn company-page posts.",
    );
  }
  const zernioPostId = resolveZernioCommentPostId(input.postId);
  if (!zernioPostId) {
    throw new ZernioApiError(400, "", "Invalid live post id for comment like.");
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
  const payload = await likeCommentReplacingConflict(
    client,
    zernioPostId,
    commentId,
    {
      accountId: account.externalId,
      ...(input.reactionType ? { reactionType: input.reactionType } : {}),
    },
  );
  const record = asRecord(payload) ?? {};
  return {
    liked: record.liked !== false,
    reactionType:
      asString(record.reactionType) ?? input.reactionType ?? "LIKE",
  };
}

/** Remove a reaction from a LinkedIn company-page comment. */
export async function unlikeSocialFeedComment(
  workspaceId: string,
  input: UnlikeSocialFeedCommentInput,
): Promise<UnlikeSocialFeedCommentResult> {
  if (input.platform !== "linkedin" || input.accountKind !== "business") {
    throw new ZernioApiError(
      400,
      "",
      "Comment reactions are only available on LinkedIn company-page posts.",
    );
  }
  const zernioPostId = resolveZernioCommentPostId(input.postId);
  if (!zernioPostId) {
    throw new ZernioApiError(
      400,
      "",
      "Invalid live post id for comment unlike.",
    );
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
  await client.unlikeComment(zernioPostId, commentId, account.externalId);
  return { liked: false };
}
