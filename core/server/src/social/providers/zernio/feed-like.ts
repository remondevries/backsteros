import { and, eq, isNull } from "drizzle-orm";

import type {
  LikeSocialFeedPostInput,
  LikeSocialFeedPostResult,
  UnlikeSocialFeedPostInput,
  UnlikeSocialFeedPostResult,
} from "@backsteros/contracts";

import { db } from "../../../db/index.js";
import { socialAccounts } from "../../../db/schema.js";
import { resolveZernioCommentPostId } from "./feed-comments.js";
import { ZernioApiError, ZernioClient } from "./client.js";
import { likePostReplacingConflict } from "./feed-like-replace.js";
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

function storedPlatformForAccountKind(
  accountKind: LikeSocialFeedPostInput["accountKind"],
): string {
  return accountKind === "business" ? "linkedin_org" : "linkedin_personal";
}

async function resolveLikerAccount(
  workspaceId: string,
  accountKind: LikeSocialFeedPostInput["accountKind"],
): Promise<string> {
  const storedPlatform = storedPlatformForAccountKind(accountKind);
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
        eq(socialAccounts.platform, storedPlatform),
        isNull(socialAccounts.deletedAt),
      ),
    )
    .limit(1);

  if (!account?.externalId) {
    throw new ZernioApiError(
      400,
      "",
      accountKind === "business"
        ? "No LinkedIn company page connected — sync accounts in Settings → Social."
        : "No LinkedIn personal profile connected — sync accounts in Settings → Social.",
    );
  }
  if (account.disconnected) {
    throw new ZernioApiError(
      400,
      "",
      "LinkedIn account is disconnected — reconnect in Settings → Social.",
    );
  }
  return account.externalId;
}

/**
 * Like (react to) a live Network LinkedIn post via Zernio inbox.
 * Works for personal and company accounts that have social-feed write scopes.
 */
export async function likeSocialFeedPost(
  workspaceId: string,
  input: LikeSocialFeedPostInput,
): Promise<LikeSocialFeedPostResult> {
  if (input.platform !== "linkedin") {
    throw new ZernioApiError(400, "", "Only LinkedIn likes are supported.");
  }

  const zernioPostId = resolveZernioCommentPostId(input.postId);
  if (!zernioPostId) {
    throw new ZernioApiError(400, "", "Invalid live post id for like.");
  }

  const creds = await getZernioCredentials(workspaceId);
  if (!creds.apiKey) {
    throw new ZernioApiError(
      400,
      "",
      "Zernio API key is not configured — add it in Settings → Social.",
    );
  }

  const accountId = await resolveLikerAccount(workspaceId, input.accountKind);
  const client = new ZernioClient({
    apiKey: creds.apiKey,
    rateKey: workspaceId,
  });
  const payload = await likePostReplacingConflict(client, zernioPostId, {
    accountId,
    ...(input.reactionType ? { reactionType: input.reactionType } : {}),
  });
  const record = asRecord(payload) ?? {};
  return {
    liked: record.liked !== false,
    alreadyReacted: Boolean(record.alreadyReacted),
    reactionType:
      asString(record.reactionType) ?? input.reactionType ?? "LIKE",
  };
}

/** Remove a LinkedIn reaction created via {@link likeSocialFeedPost}. */
export async function unlikeSocialFeedPost(
  workspaceId: string,
  input: UnlikeSocialFeedPostInput,
): Promise<UnlikeSocialFeedPostResult> {
  if (input.platform !== "linkedin") {
    throw new ZernioApiError(400, "", "Only LinkedIn likes are supported.");
  }

  const zernioPostId = resolveZernioCommentPostId(input.postId);
  if (!zernioPostId) {
    throw new ZernioApiError(400, "", "Invalid live post id for unlike.");
  }

  const creds = await getZernioCredentials(workspaceId);
  if (!creds.apiKey) {
    throw new ZernioApiError(
      400,
      "",
      "Zernio API key is not configured — add it in Settings → Social.",
    );
  }

  const accountId = await resolveLikerAccount(workspaceId, input.accountKind);
  const client = new ZernioClient({
    apiKey: creds.apiKey,
    rateKey: workspaceId,
  });
  await client.unlikePost(zernioPostId, accountId);
  return { liked: false };
}
