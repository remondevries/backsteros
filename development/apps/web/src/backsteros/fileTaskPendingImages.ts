/**
 * Holds staged paste/drop images for an in-flight Grok file-task request until
 * the webhook callback returns a task id (modal may already be closed).
 */

import type { PendingTaskImage } from "./pendingTaskImages";
import { revokePendingTaskImageUrls } from "./pendingTaskImages";

const pendingByRequestId = new Map<string, PendingTaskImage[]>();

export function stashFileTaskPendingImages(
  requestId: string,
  pending: readonly PendingTaskImage[],
): void {
  const existing = pendingByRequestId.get(requestId);
  if (existing) {
    revokePendingTaskImageUrls(existing);
  }
  if (pending.length === 0) {
    pendingByRequestId.delete(requestId);
    return;
  }
  pendingByRequestId.set(
    requestId,
    pending.map((entry) => ({ blobUrl: entry.blobUrl, file: entry.file })),
  );
}

export function takeFileTaskPendingImages(requestId: string): PendingTaskImage[] {
  const pending = pendingByRequestId.get(requestId) ?? [];
  pendingByRequestId.delete(requestId);
  return pending;
}

export function discardFileTaskPendingImages(requestId: string): void {
  const pending = pendingByRequestId.get(requestId);
  if (!pending) return;
  revokePendingTaskImageUrls(pending);
  pendingByRequestId.delete(requestId);
}

/** Test helper — clear all stashed pending images. */
export function resetFileTaskPendingImagesForTests(): void {
  for (const pending of pendingByRequestId.values()) {
    revokePendingTaskImageUrls(pending);
  }
  pendingByRequestId.clear();
}
