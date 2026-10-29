import { and, eq, isNull } from "drizzle-orm";

import type {
  PublishSocialPostInput,
  PublishSocialPostResult,
} from "@backsteros/contracts";

import { db } from "../../../db/index.js";
import { socialAccounts } from "../../../db/schema.js";
import { ZernioApiError } from "./client.js";
import { createZernioAdapter } from "./settings.js";

function storedPlatformForPublish(
  input: PublishSocialPostInput,
): string {
  return input.accountKind === "business"
    ? "linkedin_org"
    : "linkedin_personal";
}

/** Publish text immediately to the connected LinkedIn personal/org account. */
export async function publishSocialPost(
  workspaceId: string,
  input: PublishSocialPostInput,
): Promise<PublishSocialPostResult> {
  const adapter = await createZernioAdapter(workspaceId);
  if (!adapter) {
    throw new ZernioApiError(
      400,
      "",
      "Zernio API key is not configured — add it in Settings → Social.",
    );
  }

  const storedPlatform = storedPlatformForPublish(input);
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

  if (!account) {
    throw new ZernioApiError(
      400,
      "",
      input.accountKind === "business"
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

  // Adapter resolveAccount expects `zernio-account:<externalId>`, not the DB UUID.
  const published = await adapter.publishPost(
    [`zernio-account:${account.externalId}`],
    {
      text: input.body,
    },
  );

  return {
    posts: published.map((post) => ({
      id: post.id,
      platform: post.platform,
      accountId: post.accountId,
      status: post.status,
      text: post.text,
      postedAt: post.postedAt,
    })),
  };
}
