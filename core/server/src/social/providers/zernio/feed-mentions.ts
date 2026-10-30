import { and, eq, isNull } from "drizzle-orm";

import type {
  ResolveSocialLinkedInMentionQuery,
  ResolveSocialLinkedInMentionResult,
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
  return null;
}

function storedPlatformForAccountKind(
  accountKind: ResolveSocialLinkedInMentionQuery["accountKind"],
): string {
  return accountKind === "business" ? "linkedin_org" : "linkedin_personal";
}

/** Resolve a LinkedIn profile/company URL to @mention markup via Zernio. */
export async function resolveSocialLinkedInMention(
  workspaceId: string,
  query: ResolveSocialLinkedInMentionQuery,
): Promise<ResolveSocialLinkedInMentionResult> {
  if (query.platform !== "linkedin") {
    throw new ZernioApiError(400, "", "Only LinkedIn mentions are supported.");
  }
  const url = query.url.trim();
  if (!url) {
    throw new ZernioApiError(400, "", "Mention URL is required.");
  }

  const creds = await getZernioCredentials(workspaceId);
  if (!creds.apiKey) {
    throw new ZernioApiError(
      400,
      "",
      "Zernio API key is not configured — add it in Settings → Social.",
    );
  }

  const storedPlatform = storedPlatformForAccountKind(query.accountKind);
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

  // Person URL resolve needs a page admin — fall back to org account when personal.
  let accountId = account?.externalId ?? null;
  if (!accountId || account?.disconnected) {
    const [org] = await db
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
    if (org?.externalId && !org.disconnected) {
      accountId = org.externalId;
    }
  }

  if (!accountId) {
    throw new ZernioApiError(
      400,
      "",
      "No LinkedIn account connected — sync accounts in Settings → Social.",
    );
  }

  const client = new ZernioClient({
    apiKey: creds.apiKey,
    rateKey: workspaceId,
  });
  const payload = await client.resolveLinkedInMention(accountId, url);
  const record = asRecord(payload) ?? {};
  const nested =
    asRecord(record.data) ??
    asRecord(record.mention) ??
    asRecord(record.result) ??
    record;

  return {
    url,
    mentionFormat:
      asString(nested.mentionFormat) ??
      asString(nested.mention) ??
      asString(nested.format) ??
      (asString(nested.displayName)
        ? `@[${asString(nested.displayName)}](${url})`
        : `@[${url}]`),
    displayName:
      asString(nested.displayName) ?? asString(nested.name) ?? null,
  };
}

/**
 * Wrap bare LinkedIn profile/company URLs as `@[url]` so Zernio resolves them.
 * Skips URLs already inside `@[…]`.
 */
export function wrapLinkedInMentionUrls(text: string): string {
  const pattern =
    /(?<!@\[)(https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[^\s)\]]+)/gi;
  return text.replace(pattern, (match) => `@[${match}]`);
}
