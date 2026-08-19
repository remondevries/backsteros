import { and, desc, eq, isNull } from "drizzle-orm";

import type { ApiKeyScope, CreateApiKeyInput } from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  apiKeys,
  contacts,
  workspaceSettings,
  workspaces,
} from "../db/schema.js";
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

async function resolveKeyContactId(
  workspaceId: string,
  contactId: string | null | undefined,
) {
  if (contactId == null || contactId === "") return null;
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.workspaceId, workspaceId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    throw new Error("CONTACT_NOT_FOUND");
  }
  return row.id;
}

export async function createApiKey(
  workspaceId: string,
  userId: string,
  input: CreateApiKeyInput,
) {
  const secret = generateApiKeySecret();
  const id = newId();
  const contactId = await resolveKeyContactId(
    workspaceId,
    input.contactId,
  );

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
      contactId,
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
  input: { name?: string; contactId?: string | null },
) {
  const patch: { name?: string; contactId?: string | null } = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.contactId !== undefined) {
    patch.contactId = await resolveKeyContactId(workspaceId, input.contactId);
  }
  if (patch.name === undefined && patch.contactId === undefined) {
    return null;
  }

  const [row] = await db
    .update(apiKeys)
    .set(patch)
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
        contactId: null,
      })
      .returning();
  });

  return { row, secret };
}
