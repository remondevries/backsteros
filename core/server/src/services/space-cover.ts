import { and, eq, isNull } from "drizzle-orm";

import type { Document } from "@backsteros/contracts";

import { db } from "../db/index.js";
import { documents, type DbDocument } from "../db/schema.js";
import { toDocument } from "../lib/mappers.js";
import {
  assertPrivateStorageKey,
  buildSpaceCoverStorageKey,
  deleteObject,
  getObject,
  putObject,
} from "../lib/storage.js";
import { recordDocumentRestSyncEvent } from "./sync.js";

type DbExecutor = Pick<typeof db, "select" | "update">;

async function assertSpaceFolder(
  workspaceId: string,
  spaceDocumentId: string,
  executor: DbExecutor = db,
): Promise<DbDocument | null> {
  const [row] = await executor
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.id, spaceDocumentId),
        eq(documents.kind, "folder"),
        eq(documents.type, "knowledge"),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function putSpaceCover(
  workspaceId: string,
  spaceDocumentId: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<Document | null> {
  const folder = await assertSpaceFolder(workspaceId, spaceDocumentId);
  if (!folder) return null;

  const key = buildSpaceCoverStorageKey(spaceDocumentId);
  await putObject(key, bytes, contentType);

  const [updated] = await db
    .update(documents)
    .set({
      coverStorageKey: key,
      coverContentType: contentType,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.id, spaceDocumentId),
      ),
    )
    .returning();

  if (!updated) return null;
  await recordDocumentRestSyncEvent(workspaceId, updated, "upsert");
  return toDocument(updated);
}

export async function getSpaceCover(
  workspaceId: string,
  spaceDocumentId: string,
): Promise<{ contentType: string; bytes: Uint8Array } | null> {
  const folder = await assertSpaceFolder(workspaceId, spaceDocumentId);
  if (!folder?.coverStorageKey) return null;

  assertPrivateStorageKey(workspaceId, folder.coverStorageKey);
  const object = await getObject(folder.coverStorageKey);
  return {
    contentType: folder.coverContentType || object.contentType || "image/jpeg",
    bytes: object.bytes,
  };
}

export async function deleteSpaceCover(
  workspaceId: string,
  spaceDocumentId: string,
): Promise<Document | null> {
  const folder = await assertSpaceFolder(workspaceId, spaceDocumentId);
  if (!folder) return null;

  if (folder.coverStorageKey) {
    try {
      assertPrivateStorageKey(workspaceId, folder.coverStorageKey);
      await deleteObject(folder.coverStorageKey);
    } catch {
      // Metadata clear still wins if blob already gone.
    }
  }

  const [updated] = await db
    .update(documents)
    .set({
      coverStorageKey: null,
      coverContentType: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.id, spaceDocumentId),
      ),
    )
    .returning();

  if (!updated) return null;
  await recordDocumentRestSyncEvent(workspaceId, updated, "upsert");
  return toDocument(updated);
}
