import { parseTaskImageContentPath } from "@backsteros/contracts";
import { useCallback } from "react";

import { useDesktopApi } from "./api-context";

/**
 * Paste/drop upload + authenticated preview resolve for task description images.
 * Preview owns blob: URL lifetime via DocumentMarkdownPreview.
 */
export function useTaskDescriptionImages(taskId: string) {
  const { client } = useDesktopApi();

  const onUploadImages = useCallback(
    async (files: File[]) => {
      if (!taskId) return null;
      const urls: string[] = [];
      for (const file of files) {
        const image = await client.uploadTaskImage(
          taskId,
          file,
          file.name || "screenshot.png",
          file.type || undefined,
        );
        urls.push(image.url);
      }
      return urls;
    },
    [client, taskId],
  );

  const resolveImageSrc = useCallback(
    async (src: string) => {
      const parsed = parseTaskImageContentPath(src);
      if (!parsed) return src;
      const blob = await client.downloadTaskImage(
        parsed.taskId,
        parsed.imageId,
      );
      return URL.createObjectURL(blob);
    },
    [client],
  );

  return { onUploadImages, resolveImageSrc };
}
