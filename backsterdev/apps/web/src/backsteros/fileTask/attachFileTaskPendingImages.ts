import { fetchBacksterosTask, updateBacksterosTask, uploadBacksterosTaskImage } from "../client";
import { markdownImageSnippet } from "../markdown-editor/markdown-image-paste";
import { discardFileTaskPendingImages, takeFileTaskPendingImages } from "../fileTaskPendingImages";
import { revokePendingTaskImageUrls } from "../pendingTaskImages";

/**
 * After Grok files a task, upload any paste/drop images staged for that request
 * and append their markdown embeds to the task description.
 */
export async function attachFileTaskPendingImages(input: {
  readonly requestId: string;
  readonly taskId: string;
}): Promise<void> {
  const pending = takeFileTaskPendingImages(input.requestId);
  if (pending.length === 0) return;

  try {
    const urls: string[] = [];
    for (const entry of pending) {
      const image = await uploadBacksterosTaskImage(
        input.taskId,
        entry.file,
        entry.file.name || "screenshot.png",
        entry.file.type || undefined,
      );
      urls.push(image.url);
    }

    const task = await fetchBacksterosTask(input.taskId);
    const block = urls.map((url) => markdownImageSnippet(url)).join("\n");
    const base = (task.description ?? "").trimEnd();
    const next = base ? `${base}\n\n${block}\n` : `${block}\n`;
    if (next.trim() !== (task.description ?? "").trim()) {
      await updateBacksterosTask(input.taskId, { description: next });
    }
  } finally {
    revokePendingTaskImageUrls(pending);
  }
}

export function discardFileTaskPendingImagesForRequest(requestId: string): void {
  discardFileTaskPendingImages(requestId);
}
