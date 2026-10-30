import { and, eq, isNull } from "drizzle-orm";

import type {
  DeleteSocialFeedPostInput,
  DeleteSocialFeedPostResult,
} from "@backsteros/contracts";

import { db } from "../../../db/index.js";
import { socialAccounts } from "../../../db/schema.js";
import { ZernioApiError } from "./client.js";
import { createZernioAdapter } from "./settings.js";

function storedPlatformForAccountKind(
  accountKind: DeleteSocialFeedPostInput["accountKind"],
): string {
  return accountKind === "business" ? "linkedin_org" : "linkedin_personal";
}

/**
 * Unpublish/delete a Network-published LinkedIn post.
 * Requires `zernio-post:<id>` (platform-only rows can’t be removed here).
 */
export async function deleteSocialFeedPost(
  workspaceId: string,
  input: DeleteSocialFeedPostInput,
): Promise<DeleteSocialFeedPostResult> {
  if (input.platform !== "linkedin") {
    throw new ZernioApiError(
      400,
      "",
      "Only LinkedIn posts can be deleted here.",
    );
  }
  if (!input.postId.startsWith("zernio-post:")) {
    throw new ZernioApiError(
      400,
      "",
      "Only posts published through Network can be deleted here.",
    );
  }

  const adapter = await createZernioAdapter(workspaceId);
  if (!adapter) {
    throw new ZernioApiError(
      400,
      "",
      "Zernio API key is not configured — add it in Settings → Social.",
    );
  }

  const storedPlatform = storedPlatformForAccountKind(input.accountKind);
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

  await adapter.deletePost(input.postId, {
    accountId: `zernio-account:${account.externalId}`,
  });

  return { deleted: true };
}
