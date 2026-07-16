import { and, desc, eq, isNull } from "drizzle-orm";

import type { ApiKeyScope, CreateApiKeyInput } from "@backsteros/contracts";

import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import {
  apiKeyLookupPrefix,
  generateApiKeySecret,
  hashApiKey,
  newId,
} from "../lib/crypto.js";

export async function listApiKeys(userId: string) {
  return db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function createApiKey(userId: string, input: CreateApiKeyInput) {
  const secret = generateApiKeySecret();
  const id = newId();

  const [row] = await db
    .insert(apiKeys)
    .values({
      id,
      userId,
      name: input.name,
      prefix: apiKeyLookupPrefix(secret),
      keyHash: hashApiKey(secret),
      scopes: input.scopes as ApiKeyScope[],
    })
    .returning();

  return { row, secret };
}

export async function revokeApiKey(userId: string, id: string) {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)),
    )
    .returning();

  return row ?? null;
}

export async function createBootstrapApiKey(
  name: string,
  scopes: ApiKeyScope[],
) {
  const secret = generateApiKeySecret();
  const id = newId();

  const [row] = await db
    .insert(apiKeys)
    .values({
      id,
      userId: null,
      name,
      prefix: apiKeyLookupPrefix(secret),
      keyHash: hashApiKey(secret),
      scopes,
    })
    .returning();

  return { row, secret };
}
