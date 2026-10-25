import { and, eq } from "drizzle-orm";

import { newId } from "../../lib/crypto.js";
import {
  assertPrivateStorageKey,
  buildPrivateStorageKey,
  checksumForContent,
  deleteObject,
  getObject,
  putObject,
} from "../../lib/storage.js";
import { db } from "../../db/index.js";
import { avatars, bankAccounts, contacts, organizations } from "../../db/schema.js";
function avatarObjectFileName(entityType: string): string {
  // Portal avatar shares the contact id but must not overwrite the personal blob.
  if (entityType === "avatar_portal") return "avatar-portal";
  return "avatar";
}

export async function putAvatar(
  workspaceId: string,
  entityType: string,
  entityId: string,
  bytes: Uint8Array,
  contentType: string,
  options?: { updateEntityColumns?: boolean },
) {
  const updateEntityColumns = options?.updateEntityColumns !== false;
  let storeBytes = bytes;
  let storeType = contentType;
  // Contact + organization avatars sync to iOS CardDAV — keep stored sizes sane.
  if (entityType === "contact" || entityType === "organization") {
    const { optimizeContactAvatarForStorage } = await import(
      "../carddav/photo.js"
    );
    const optimized = await optimizeContactAvatarForStorage(bytes, contentType);
    storeBytes = optimized.bytes;
    storeType = optimized.contentType;
  }
  const id = newId();
  const key = buildPrivateStorageKey(
    workspaceId,
    "avatars",
    entityId,
    avatarObjectFileName(entityType),
  );
  const stored = await putObject(key, storeBytes, storeType);
  const [row] = await db
    .insert(avatars)
    .values({
      id,
      workspaceId,
      entityType,
      entityId,
      storageKey: key,
      contentType: storeType,
      byteSize: stored.byteSize,
      checksum: checksumForContent(storeBytes),
      contentEtag: stored.etag,
    })
    .onConflictDoUpdate({
      target: [avatars.workspaceId, avatars.entityType, avatars.entityId],
      set: {
        storageKey: key,
        contentType: storeType,
        byteSize: stored.byteSize,
        checksum: checksumForContent(storeBytes),
        contentEtag: stored.etag,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (updateEntityColumns) {
    if (entityType === "organization") {
      await db
        .update(organizations)
        .set({ avatarStorageKey: key, avatarContentType: storeType, updatedAt: new Date() })
        .where(and(eq(organizations.workspaceId, workspaceId), eq(organizations.id, entityId)));
    } else if (entityType === "contact") {
      await db
        .update(contacts)
        .set({ avatarStorageKey: key, avatarContentType: storeType, updatedAt: new Date() })
        .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, entityId)));
    } else if (entityType === "bank_account") {
      await db
        .update(bankAccounts)
        .set({
          avatarStorageKey: key,
          avatarContentType: storeType,
          updatedAt: new Date(),
        })
        .where(
          and(eq(bankAccounts.workspaceId, workspaceId), eq(bankAccounts.id, entityId)),
        );
    }
  }
  // Portal avatar columns always persist with the blob write — even under
  // leader-first (`updateEntityColumns: false`) — so a successful portal upload
  // cannot leave `portal_avatar_*` null while overwriting the personal `/avatar`
  // object (legacy shared-key bug).
  if (entityType === "avatar_portal") {
    await db
      .update(contacts)
      .set({
        portalAvatarStorageKey: key,
        portalAvatarContentType: contentType,
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, entityId)));
  }
  return row!;
}

export async function getAvatar(workspaceId: string, entityType: string, entityId: string) {
  const [row] = await db
    .select()
    .from(avatars)
    .where(
      and(
        eq(avatars.workspaceId, workspaceId),
        eq(avatars.entityType, entityType),
        eq(avatars.entityId, entityId),
      ),
    )
    .limit(1);
  if (!row) return null;
  assertPrivateStorageKey(workspaceId, row.storageKey);
  try {
    const object = await getObject(row.storageKey);
    return { row, bytes: object.bytes };
  } catch (error) {
    if (error instanceof Error && error.message === "STORAGE_OBJECT_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

export async function deleteAvatar(
  workspaceId: string,
  entityType: string,
  entityId: string,
  options?: { updateEntityColumns?: boolean },
) {
  const updateEntityColumns = options?.updateEntityColumns !== false;
  const [row] = await db
    .select()
    .from(avatars)
    .where(
      and(
        eq(avatars.workspaceId, workspaceId),
        eq(avatars.entityType, entityType),
        eq(avatars.entityId, entityId),
      ),
    )
    .limit(1);
  if (!row) return null;

  assertPrivateStorageKey(workspaceId, row.storageKey);
  try {
    await deleteObject(row.storageKey);
  } catch {
    // Continue clearing DB even if object storage delete fails.
  }

  await db
    .delete(avatars)
    .where(
      and(
        eq(avatars.workspaceId, workspaceId),
        eq(avatars.entityType, entityType),
        eq(avatars.entityId, entityId),
      ),
    );

  if (updateEntityColumns) {
    if (entityType === "organization") {
      await db
        .update(organizations)
        .set({
          avatarStorageKey: null,
          avatarContentType: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizations.workspaceId, workspaceId),
            eq(organizations.id, entityId),
          ),
        );
    } else if (entityType === "contact") {
      await db
        .update(contacts)
        .set({
          avatarStorageKey: null,
          avatarContentType: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, entityId)),
        );
    } else if (entityType === "bank_account") {
      await db
        .update(bankAccounts)
        .set({
          avatarStorageKey: null,
          avatarContentType: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(bankAccounts.workspaceId, workspaceId), eq(bankAccounts.id, entityId)),
        );
    }
  }
  if (entityType === "avatar_portal") {
    await db
      .update(contacts)
      .set({
        portalAvatarStorageKey: null,
        portalAvatarContentType: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, entityId)),
      );
  }

  return row;
}
