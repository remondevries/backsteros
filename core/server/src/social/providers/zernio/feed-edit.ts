import { and, eq, isNull } from "drizzle-orm";

import type {
  EditSocialFeedPostInput,
  EditSocialFeedPostResult,
} from "@backsteros/contracts";

import { db } from "../../../db/index.js";
import { socialAccounts } from "../../../db/schema.js";
import { createZernioAdapter } from "./settings.js";
import { ZernioApiError } from "./client.js";

function storedPlatformForAccountKind(
  accountKind: EditSocialFeedPostInput["accountKind"],
): string {
  return accountKind === "business" ? "linkedin_org" : "linkedin_personal";
}

/**
 * Edit text on a live Network LinkedIn post published through Zernio.
 * Requires a `zernio-post:<id>` feed id (platform-only rows can’t be edited).
 */
export async function editSocialFeedPost(
  workspaceId: string,
  input: EditSocialFeedPostInput,
): Promise<EditSocialFeedPostResult> {
  if (input.platform !== "linkedin") {
    throw new ZernioApiError(400, "", "Only LinkedIn post edits are supported.");
  }

  const trimmed = input.body.trim();
  if (!trimmed) {
    throw new ZernioApiError(400, "", "Post text is required.");
  }
  if (trimmed.length > 3000) {
    throw new ZernioApiError(
      400,
      "",
      "LinkedIn post text must be 3,000 characters or fewer.",
    );
  }

  if (!input.postId.startsWith("zernio-post:")) {
    throw new ZernioApiError(
      400,
      "",
      "Only posts published through Network can be edited here.",
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

  const edited = await adapter.editPost(input.postId, {
    text: trimmed,
    accountId: `zernio-account:${account.externalId}`,
  });

  return {
    id: edited.id,
    body: edited.text,
  };
}
