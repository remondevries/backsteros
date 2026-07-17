import { and, desc, eq, isNull } from "drizzle-orm";

import type { ApiKeyScope, CreateApiKeyInput } from "@backsteros/contracts";

import { db } from "../db/index.js";
import { apiKeys, workspaceSettings, workspaces } from "../db/schema.js";
import {
  apiKeyLookupPrefix,
  generateApiKeySecret,
  hashApiKey,
  newId,
} from "../lib/crypto.js";

export async function listApiKeys(workspaceId: string) {
  return db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.workspaceId, workspaceId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function createApiKey(
  workspaceId: string,
  userId: string,
  input: CreateApiKeyInput,
) {
  const secret = generateApiKeySecret();
  const id = newId();

  const [row] = await db
    .insert(apiKeys)
    .values({
      id,
      workspaceId,
      userId,
      name: input.name,
      prefix: apiKeyLookupPrefix(secret),
      keyHash: hashApiKey(secret),
      scopes: input.scopes as ApiKeyScope[],
    })
    .returning();

  return { row, secret };
}

export async function revokeApiKey(workspaceId: string, id: string) {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.workspaceId, workspaceId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning();

  return row ?? null;
}

export async function updateApiKey(
  workspaceId: string,
  id: string,
  input: { name: string },
) {
  const [row] = await db
    .update(apiKeys)
    .set({ name: input.name })
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.workspaceId, workspaceId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning();

  return row ?? null;
}

export async function createBootstrapApiKey(
  name: string,
  scopes: ApiKeyScope[],
  workspaceId = "ws_legacy_default",
) {
  const secret = generateApiKeySecret();
  const id = newId();

  const [row] = await db.transaction(async (tx) => {
    await tx
      .insert(workspaces)
      .values({
        id: workspaceId,
        name: "BacksterOS",
        slug: workspaceId === "ws_legacy_default" ? "backsteros" : workspaceId,
      })
      .onConflictDoNothing();
    await tx
      .insert(workspaceSettings)
      .values({ workspaceId })
      .onConflictDoNothing();
    return tx
      .insert(apiKeys)
      .values({
        id,
        workspaceId,
        userId: null,
        name,
        prefix: apiKeyLookupPrefix(secret),
        keyHash: hashApiKey(secret),
        scopes,
      })
      .returning();
  });

  return { row, secret };
}
