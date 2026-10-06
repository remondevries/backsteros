import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { apiKeyLookupPrefix, generateApiKeySecret, hashApiKey, newId } from "./crypto.js";
import {
  DYNAMIC_ISLAND_API_KEY_NAME,
  DYNAMIC_ISLAND_SCOPES,
  isPairFlowIslandKey,
} from "./dynamic-island-local-key-format.js";

export {
  DYNAMIC_ISLAND_API_KEY_NAME,
  DYNAMIC_ISLAND_DEFAULT_API_URL,
  DYNAMIC_ISLAND_SCOPES,
  isPairFlowIslandKey,
} from "./dynamic-island-local-key-format.js";

/**
 * Mint a read-only Dynamic Island key and revoke previous pair-flow keys
 * (same name + exact scopes + no contactId). Hand-made keys with the same
 * name but other scopes are left alone. Secret returned once; never log it.
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
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`dynamic-island:${input.workspaceId}`}))`,
    );

    const previous = await tx
      .select({
        id: apiKeys.id,
        contactId: apiKeys.contactId,
        scopes: apiKeys.scopes,
      })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.workspaceId, input.workspaceId),
          eq(apiKeys.name, DYNAMIC_ISLAND_API_KEY_NAME),
          isNull(apiKeys.revokedAt),
        ),
      );
    const revokedIds = previous
      .filter((item) => isPairFlowIslandKey(item))
      .map((item) => item.id);
    if (revokedIds.length > 0) {
      await tx
        .update(apiKeys)
        .set({ revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(apiKeys.workspaceId, input.workspaceId),
            inArray(apiKeys.id, revokedIds),
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
