import { and, eq, isNull } from "drizzle-orm";

import type { TaskImage } from "@backsteros/contracts";
import { taskImageContentPath } from "@backsteros/contracts";

import { db } from "../db/index.js";
import { taskImages, type DbTaskImage } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  assertPrivateStorageKey,
  buildTaskImageStorageKey,
  checksumForContent,
  getObject,
  putObject,
} from "../lib/storage.js";
import { getTaskById } from "./tasks-projects.js";

function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

export function toTaskImage(row: DbTaskImage): TaskImage {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    taskId: row.taskId,
    contentType: row.contentType,
    byteSize: row.byteSize,
    originalFilename: row.originalFilename,
    checksum: row.checksum,
    url: taskImageContentPath(row.taskId, row.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createTaskImage(
  workspaceId: string,
  taskId: string,
  bytes: Uint8Array,
  contentType: string,
  fileName?: string,
): Promise<TaskImage | null> {
  const task = await getTaskById(workspaceId, taskId);
  if (!task) return null;

  const imageId = newId();
  const key = buildTaskImageStorageKey(
    taskId,
    imageId,
    extensionForContentType(contentType),
  );
  const stored = await putObject(key, bytes, contentType);
  const [row] = await db
    .insert(taskImages)
    .values({
      id: imageId,
      workspaceId,
      taskId,
      storageKey: key,
      originalFilename: fileName?.trim() || `screenshot.${extensionForContentType(contentType)}`,
      contentType,
      byteSize: stored.byteSize,
      checksum: checksumForContent(bytes),
      contentEtag: stored.etag,
    })
    .returning();
  return row ? toTaskImage(row) : null;
}

export async function getTaskImage(
  workspaceId: string,
  taskId: string,
  imageId: string,
): Promise<{ row: DbTaskImage; bytes: Uint8Array } | null> {
  const [row] = await db
    .select()
    .from(taskImages)
    .where(
      and(
        eq(taskImages.workspaceId, workspaceId),
        eq(taskImages.taskId, taskId),
        eq(taskImages.id, imageId),
        isNull(taskImages.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  assertPrivateStorageKey(workspaceId, row.storageKey);
  const object = await getObject(row.storageKey);
  return { row, bytes: object.bytes };
}
