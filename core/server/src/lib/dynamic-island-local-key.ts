import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { apiKeyLookupPrefix, generateApiKeySecret, hashApiKey, newId } from "./crypto.js";
import {
  DYNAMIC_ISLAND_API_KEY_NAME,
  DYNAMIC_ISLAND_SCOPES,
} from "./dynamic-island-local-key-format.js";

export {
  DYNAMIC_ISLAND_API_KEY_NAME,
  DYNAMIC_ISLAND_DEFAULT_API_URL,
  DYNAMIC_ISLAND_SCOPES,
} from "./dynamic-island-local-key-format.js";

/**
 * Mint a read-only Dynamic Island key and revoke any previous active key
 * with the same name in this workspace. The secret is returned once; callers
 * must not log it.
 */
export async function rotateDynamicIslandApiKey(input: {
  workspaceId: string;
  userId: string;
}): Promise<{
  row: typeof apiKeys.$inferSelect;
  secret: string;
  revokedIds: string[];
}> {
  const secret = generateApiKeySecret();
  const id = newId();
  const now = new Date();

  const { row, revokedIds } = await db.transaction(async (tx) => {
    const previous = await tx
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.workspaceId, input.workspaceId),
          eq(apiKeys.name, DYNAMIC_ISLAND_API_KEY_NAME),
          isNull(apiKeys.revokedAt),
        ),
      );
    const revokedIds = previous.map((item) => item.id);
    if (revokedIds.length > 0) {
      await tx
        .update(apiKeys)
        .set({ revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(apiKeys.workspaceId, input.workspaceId),
            eq(apiKeys.name, DYNAMIC_ISLAND_API_KEY_NAME),
            isNull(apiKeys.revokedAt),
          ),
        );
    }
    const [row] = await tx
      .insert(apiKeys)
      .values({
        id,
        workspaceId: input.workspaceId,
        userId: input.userId,
        name: DYNAMIC_ISLAND_API_KEY_NAME,
        prefix: apiKeyLookupPrefix(secret),
        keyHash: hashApiKey(secret),
        scopes: [...DYNAMIC_ISLAND_SCOPES],
        contactId: null,
        updatedAt: now,
      })
      .returning();
    return { row, revokedIds };
  });

  return { row, secret, revokedIds };
}
