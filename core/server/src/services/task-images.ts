import { and, eq, isNull, desc } from "drizzle-orm";

import type { TaskImage, TaskImageUploadInput } from "@backsteros/contracts";
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
import {
  decodeTaskImageBase64,
  normalizeTaskImageMimeType,
  sniffTaskImageContentType,
} from "../lib/task-image-content-type.js";
import { MAX_TASK_IMAGE_BYTES } from "../lib/upload-limits.js";
import { fetchPrivateObjectFromPeer } from "./core-replication/private-object-replication.js";
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
    commentId: row.commentId ?? null,
    contentType: row.contentType,
    byteSize: row.byteSize,
    originalFilename: row.originalFilename,
    checksum: row.checksum,
    url: taskImageContentPath(row.taskId, row.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function markdownImageSnippet(
  url: string,
  alt = "screenshot",
): string {
  const safeAlt = alt.replace(/[[\]]/g, "").trim() || "screenshot";
  return `![${safeAlt}](${url})`;
}

export function appendImageMarkdown(
  text: string | null | undefined,
  images: ReadonlyArray<{ url: string; alt?: string | null }>,
): string {
  if (images.length === 0) return text ?? "";
  const block = images
    .map((image) => markdownImageSnippet(image.url, image.alt ?? undefined))
    .join("\n");
  const base = (text ?? "").trimEnd();
  if (!base) return block;
  return `${base}\n\n${block}`;
}

export type DecodedTaskImageUpload = {
  bytes: Uint8Array;
  contentType: string;
  filename?: string;
  alt?: string;
};

export function decodeTaskImageUpload(
  input: TaskImageUploadInput,
): DecodedTaskImageUpload | { error: string } {
  const bytes = decodeTaskImageBase64(input.data);
  if (!bytes || bytes.byteLength === 0) {
    return { error: "Image data must be valid base64" };
  }
  if (bytes.byteLength > MAX_TASK_IMAGE_BYTES) {
    return {
      error: "Image must be a JPG, PNG, WebP, or GIF up to 10 MB",
    };
  }
  const contentType =
    sniffTaskImageContentType(bytes) ??
    normalizeTaskImageMimeType(input.contentType);
  if (!contentType) {
    return {
      error: "Image must be a JPG, PNG, WebP, or GIF up to 10 MB",
    };
  }
  return {
    bytes,
    contentType,
    filename: input.filename,
    alt: input.alt,
  };
}

export async function createTaskImage(
  workspaceId: string,
  taskId: string,
  bytes: Uint8Array,
  contentType: string,
  fileName?: string,
  options?: { commentId?: string | null },
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
      commentId: options?.commentId ?? null,
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

export async function listTaskImages(
  workspaceId: string,
  taskId: string,
  options?: { commentId?: string | null },
): Promise<TaskImage[] | null> {
  const task = await getTaskById(workspaceId, taskId);
  if (!task) return null;

  const conditions = [
    eq(taskImages.workspaceId, workspaceId),
    eq(taskImages.taskId, taskId),
    isNull(taskImages.deletedAt),
  ];
  if (options?.commentId !== undefined) {
    if (options.commentId === null) {
      conditions.push(isNull(taskImages.commentId));
    } else {
      conditions.push(eq(taskImages.commentId, options.commentId));
    }
  }

  const rows = await db
    .select()
    .from(taskImages)
    .where(and(...conditions))
    .orderBy(desc(taskImages.createdAt));
  return rows.map(toTaskImage);
}

export async function listTaskImagesForComments(
  workspaceId: string,
  taskId: string,
  commentIds: readonly string[],
): Promise<Map<string, TaskImage[]>> {
  const out = new Map<string, TaskImage[]>();
  if (commentIds.length === 0) return out;
  const rows = await db
    .select()
    .from(taskImages)
    .where(
      and(
        eq(taskImages.workspaceId, workspaceId),
        eq(taskImages.taskId, taskId),
        isNull(taskImages.deletedAt),
      ),
    )
    .orderBy(desc(taskImages.createdAt));
  const wanted = new Set(commentIds);
  for (const row of rows) {
    if (!row.commentId || !wanted.has(row.commentId)) continue;
    const list = out.get(row.commentId) ?? [];
    list.push(toTaskImage(row));
    out.set(row.commentId, list);
  }
  return out;
}

async function loadTaskImageBytes(
  storageKey: string,
  contentType: string,
): Promise<Uint8Array | null> {
  try {
    const object = await getObject(storageKey);
    return object.bytes;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "STORAGE_OBJECT_NOT_FOUND"
    ) {
      throw error;
    }
  }

  const fromPeer = await fetchPrivateObjectFromPeer(storageKey);
  if (!fromPeer) return null;
  await putObject(storageKey, fromPeer, contentType);
  return fromPeer;
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
  const bytes = await loadTaskImageBytes(row.storageKey, row.contentType);
  if (!bytes) return null;
  return { row, bytes };
}

export type CreatedTaskImageUpload = {
  image: TaskImage;
  alt?: string;
};

/**
 * Upload JSON base64 images, optionally link to a comment, return created rows.
 */
export async function createTaskImagesFromUploads(
  workspaceId: string,
  taskId: string,
  uploads: readonly TaskImageUploadInput[],
  options?: { commentId?: string | null },
): Promise<{ images: CreatedTaskImageUpload[] } | { error: string }> {
  const images: CreatedTaskImageUpload[] = [];
  for (const upload of uploads) {
    const decoded = decodeTaskImageUpload(upload);
    if ("error" in decoded) return decoded;
    const image = await createTaskImage(
      workspaceId,
      taskId,
      decoded.bytes,
      decoded.contentType,
      decoded.filename,
      { commentId: options?.commentId },
    );
    if (!image) return { error: "Task not found" };
    images.push({ image, alt: decoded.alt });
  }
  return { images };
}
