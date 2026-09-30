import { and, desc, eq, isNull } from "drizzle-orm";

import type { ApiKeyScope, CreateApiKeyInput } from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  apiKeys,
  contacts,
  users,
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

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * True when an API key's attached contact is the workspace owner themself:
 * the key belongs to the workspace owner and the contact's email equals that
 * user's email. Such a key is the owner's key with name attribution, not an
 * agent persona key (agent contacts have no matching owner email).
 */
export async function apiKeyContactIsWorkspaceOwner(auth: {
  kind: string;
  userId: string | null;
  contactId: string | null;
  workspaceId: string;
}): Promise<boolean> {
  if (auth.kind !== "api_key" || !auth.contactId || !auth.userId) return false;
  const [row] = await db
    .select({
      contactEmail: contacts.email,
      userEmail: users.email,
      ownerUserId: workspaces.ownerUserId,
    })
    .from(contacts)
    .innerJoin(workspaces, eq(workspaces.id, contacts.workspaceId))
    .innerJoin(users, eq(users.id, auth.userId))
    .where(
      and(
        eq(contacts.id, auth.contactId),
        eq(contacts.workspaceId, auth.workspaceId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!row || row.ownerUserId !== auth.userId) return false;
  const contactEmail = normalizeEmail(row.contactEmail);
  return contactEmail !== null && contactEmail === normalizeEmail(row.userEmail);
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

  const now = new Date();
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
      updatedAt: now,
    })
    .returning();

  return { row, secret };
}

export async function revokeApiKey(workspaceId: string, id: string) {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
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
    .set({ ...patch, updatedAt: new Date() })
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
    const now = new Date();
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
        updatedAt: now,
      })
      .returning();
  });

  return { row, secret };
}
