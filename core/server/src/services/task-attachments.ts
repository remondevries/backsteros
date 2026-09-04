import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { TaskAttachment } from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  taskAttachments,
  type DbTaskAttachment,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  assertPrivateStorageKey,
  buildTaskAttachmentStorageKey,
  checksumForContent,
  deleteObject,
  getObject,
  putObject,
} from "../lib/storage.js";
import { getTaskById } from "./tasks-projects.js";

export function toTaskAttachment(row: DbTaskAttachment): TaskAttachment {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    taskId: row.taskId,
    storageKey: row.storageKey,
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    byteSize: row.byteSize,
    checksum: row.checksum,
    contentEtag: row.contentEtag,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export async function listTaskAttachments(
  workspaceId: string,
  taskId: string,
): Promise<TaskAttachment[] | null> {
  const task = await getTaskById(workspaceId, taskId);
  if (!task) return null;
  const rows = await db
    .select()
    .from(taskAttachments)
    .where(
      and(
        eq(taskAttachments.workspaceId, workspaceId),
        eq(taskAttachments.taskId, taskId),
        isNull(taskAttachments.deletedAt),
      ),
    )
    .orderBy(asc(taskAttachments.sortOrder), asc(taskAttachments.createdAt));
  return rows.map(toTaskAttachment);
}

export async function createTaskAttachment(
  workspaceId: string,
  taskId: string,
  bytes: Uint8Array,
  fileName: string,
  contentType: string,
): Promise<TaskAttachment | null> {
  const task = await getTaskById(workspaceId, taskId);
  if (!task) return null;

  const attachmentId = newId();
  const originalFilename = fileName.trim() || "attachment.bin";
  const storedContentType =
    contentType.trim() || "application/octet-stream";
  const key = buildTaskAttachmentStorageKey(
    taskId,
    attachmentId,
    originalFilename,
  );
  const stored = await putObject(key, bytes, storedContentType);
  const [row] = await db
    .insert(taskAttachments)
    .values({
      id: attachmentId,
      workspaceId,
      taskId,
      storageKey: key,
      originalFilename,
      contentType: storedContentType,
      byteSize: stored.byteSize,
      checksum: checksumForContent(bytes),
      contentEtag: stored.etag,
      sortOrder: Date.now(),
    })
    .returning();
  return row ? toTaskAttachment(row) : null;
}

export async function getTaskAttachment(
  workspaceId: string,
  taskId: string,
  attachmentId: string,
): Promise<{ row: DbTaskAttachment; bytes: Uint8Array } | null> {
  const [row] = await db
    .select()
    .from(taskAttachments)
    .where(
      and(
        eq(taskAttachments.workspaceId, workspaceId),
        eq(taskAttachments.taskId, taskId),
        eq(taskAttachments.id, attachmentId),
        isNull(taskAttachments.deletedAt),
      ),
    )
    .limit(1);
  if (!row?.storageKey) return null;
  assertPrivateStorageKey(workspaceId, row.storageKey);
  const object = await getObject(row.storageKey);
  return { row, bytes: object.bytes };
}

export async function deleteTaskAttachment(
  workspaceId: string,
  taskId: string,
  attachmentId: string,
): Promise<TaskAttachment | null> {
  const [row] = await db
    .update(taskAttachments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(taskAttachments.workspaceId, workspaceId),
        eq(taskAttachments.taskId, taskId),
        eq(taskAttachments.id, attachmentId),
        isNull(taskAttachments.deletedAt),
      ),
    )
    .returning();
  if (!row) return null;

  if (row.storageKey) {
    try {
      assertPrivateStorageKey(workspaceId, row.storageKey);
      await deleteObject(row.storageKey);
    } catch (error) {
      console.error(
        "[api] failed to delete task attachment object",
        row.storageKey,
        error,
      );
    }
  }
  return toTaskAttachment(row);
}

export async function updateTaskAttachment(
  workspaceId: string,
  taskId: string,
  attachmentId: string,
  input: { originalFilename: string },
): Promise<TaskAttachment | null> {
  const filename = input.originalFilename.trim();
  if (!filename) return null;

  const [row] = await db
    .update(taskAttachments)
    .set({
      originalFilename: filename,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(taskAttachments.workspaceId, workspaceId),
        eq(taskAttachments.taskId, taskId),
        eq(taskAttachments.id, attachmentId),
        isNull(taskAttachments.deletedAt),
      ),
    )
    .returning();
  return row ? toTaskAttachment(row) : null;
}

export async function reorderTaskAttachments(
  workspaceId: string,
  taskId: string,
  orderedIds: string[],
): Promise<TaskAttachment[] | null> {
  const task = await getTaskById(workspaceId, taskId);
  if (!task) return null;

  const uniqueIds = [...new Set(orderedIds)];
  if (uniqueIds.length !== orderedIds.length) {
    throw new Error("ATTACHMENT_IDS_INVALID");
  }

  await db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: taskAttachments.id })
      .from(taskAttachments)
      .where(
        and(
          eq(taskAttachments.workspaceId, workspaceId),
          eq(taskAttachments.taskId, taskId),
          inArray(taskAttachments.id, orderedIds),
          isNull(taskAttachments.deletedAt),
        ),
      );
    if (owned.length !== orderedIds.length) {
      throw new Error("ATTACHMENT_NOT_FOUND");
    }

    for (let index = 0; index < orderedIds.length; index += 1) {
      const id = orderedIds[index]!;
      await tx
        .update(taskAttachments)
        .set({ sortOrder: index + 1, updatedAt: new Date() })
        .where(
          and(
            eq(taskAttachments.workspaceId, workspaceId),
            eq(taskAttachments.taskId, taskId),
            eq(taskAttachments.id, id),
            isNull(taskAttachments.deletedAt),
          ),
        );
    }
  });

  return listTaskAttachments(workspaceId, taskId);
}
