import { useCallback } from "react";

import { downloadBacksterosTaskImage, uploadBacksterosTaskImage } from "./client";
import { parseTaskImageContentPath } from "./taskImagePaths";

/**
 * Paste/drop upload + authenticated preview resolve for task description images.
 * Preview owns blob: URL lifetime via BacksterosMarkdownPreview.
 */
export function useTaskDescriptionImages(taskId: string) {
  const onUploadImages = useCallback(
    async (files: File[]) => {
      if (!taskId) return null;
      const urls: string[] = [];
      for (const file of files) {
        const image = await uploadBacksterosTaskImage(
          taskId,
          file,
          file.name || "screenshot.png",
          file.type || undefined,
        );
        urls.push(image.url);
      }
      return urls;
    },
    [taskId],
  );

  const resolveImageSrc = useCallback(async (src: string) => {
    const parsed = parseTaskImageContentPath(src);
    if (!parsed) return src;
    const blob = await downloadBacksterosTaskImage(parsed.taskId, parsed.imageId);
    return URL.createObjectURL(blob);
  }, []);

  return { onUploadImages, resolveImageSrc };
}
