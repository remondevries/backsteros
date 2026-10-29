import type {
  SocialPlannedPostMedia,
  SocialPlannedPostMediaUpload,
} from "@backsteros/contracts";
import { socialPlannedPostMediaPath } from "@backsteros/contracts";

import { newId } from "../lib/crypto.js";
import {
  assertPrivateStorageKey,
  buildSocialPostMediaStorageKey,
  getObject,
  putObject,
} from "../lib/storage.js";
import { decodeTaskImageBase64 } from "../lib/task-image-content-type.js";
import { MAX_UPLOAD_BYTES } from "../lib/upload-limits.js";

/** Stored on `social_posts.media` jsonb (includes private storage key). */
export type StoredSocialPostMedia = SocialPlannedPostMedia & {
  storageKey: string;
};

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function normalizeMime(value: string | null | undefined): string | null {
  const mime = value?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!mime) return null;
  if (mime === "image/jpg" || mime === "image/pjpeg") return "image/jpeg";
  if (IMAGE_TYPES.has(mime) || VIDEO_TYPES.has(mime)) return mime;
  return null;
}

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
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return "bin";
  }
}

function kindForContentType(
  contentType: string,
  declared?: "image" | "video",
): "image" | "video" | null {
  if (declared === "image" || declared === "video") return declared;
  if (IMAGE_TYPES.has(contentType)) return "image";
  if (VIDEO_TYPES.has(contentType)) return "video";
  return null;
}

export function toPublicSocialPostMedia(
  items: readonly StoredSocialPostMedia[] | null | undefined,
): SocialPlannedPostMedia[] {
  if (!items?.length) return [];
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    url: item.url,
    contentType: item.contentType,
    filename: item.filename ?? null,
  }));
}

export function parseStoredSocialPostMedia(
  value: unknown,
): StoredSocialPostMedia[] {
  if (!Array.isArray(value)) return [];
  const out: StoredSocialPostMedia[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    const kind = row.kind === "image" || row.kind === "video" ? row.kind : null;
    const url = typeof row.url === "string" ? row.url : null;
    const contentType =
      typeof row.contentType === "string" ? row.contentType : null;
    const storageKey =
      typeof row.storageKey === "string" ? row.storageKey : null;
    if (!id || !kind || !url || !contentType || !storageKey) continue;
    out.push({
      id,
      kind,
      url,
      contentType,
      filename:
        typeof row.filename === "string"
          ? row.filename
          : row.filename === null
            ? null
            : undefined,
      storageKey,
    });
  }
  return out;
}

export async function storeSocialPostMediaUploads(
  postId: string,
  uploads: readonly SocialPlannedPostMediaUpload[],
  existing: readonly StoredSocialPostMedia[] = [],
): Promise<StoredSocialPostMedia[]> {
  const next = [...existing];
  for (const upload of uploads) {
    if (next.length >= 5) break;
    const bytes = decodeTaskImageBase64(upload.data);
    if (!bytes || bytes.byteLength === 0) {
      throw new Error("Media data must be valid base64");
    }
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error("Media must be 25 MB or smaller");
    }
    const contentType = normalizeMime(upload.contentType);
    if (!contentType) {
      throw new Error(
        "Media must be JPEG, PNG, WebP, GIF, MP4, WebM, or QuickTime",
      );
    }
    const kind = kindForContentType(contentType, upload.kind);
    if (!kind) {
      throw new Error(
        "Media must be JPEG, PNG, WebP, GIF, MP4, WebM, or QuickTime",
      );
    }
    const mediaId = newId();
    const storageKey = buildSocialPostMediaStorageKey(
      postId,
      mediaId,
      extensionForContentType(contentType),
    );
    assertPrivateStorageKey("", storageKey);
    await putObject(storageKey, bytes, contentType);
    next.push({
      id: mediaId,
      kind,
      url: socialPlannedPostMediaPath(postId, mediaId),
      contentType,
      filename: upload.filename?.trim() || null,
      storageKey,
    });
  }
  return next;
}

export async function readSocialPostMediaBytes(
  items: readonly StoredSocialPostMedia[],
  mediaId: string,
): Promise<{ bytes: Uint8Array; contentType: string; filename: string | null } | null> {
  const item = items.find((entry) => entry.id === mediaId);
  if (!item) return null;
  assertPrivateStorageKey("", item.storageKey);
  try {
    const stored = await getObject(item.storageKey);
    return {
      bytes: stored.bytes,
      contentType: item.contentType || stored.contentType,
      filename: item.filename ?? null,
    };
  } catch {
    return null;
  }
}
