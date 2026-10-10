import { useCallback, useEffect, useRef } from "react";

import { toastManager } from "~/components/ui/toast";

import type { UploadMarkdownImages } from "./markdown-editor/markdown-image-paste";
import {
  type PendingTaskImage,
  revokePendingTaskImageUrls,
  stagePendingTaskImages,
} from "./pendingTaskImages";

/**
 * Stage paste/drop images as blob: markdown embeds until a task id exists.
 * Caller uploads via `commitPendingTaskImages` after create.
 */
export function usePendingTaskImages(): {
  readonly onUploadImages: UploadMarkdownImages;
  readonly takePending: () => PendingTaskImage[];
  readonly restorePending: (pending: readonly PendingTaskImage[]) => void;
  readonly peekPending: () => readonly PendingTaskImage[];
} {
  const pendingRef = useRef<PendingTaskImage[]>([]);

  useEffect(() => {
    return () => {
      revokePendingTaskImageUrls(pendingRef.current);
      pendingRef.current = [];
    };
  }, []);

  const onUploadImages = useCallback<UploadMarkdownImages>(async (files) => {
    const { staged, errors } = stagePendingTaskImages(files);
    for (const message of errors) {
      toastManager.add({
        type: "error",
        title: "Could not attach image",
        description: message,
      });
    }
    if (staged.length === 0) return null;
    pendingRef.current = [...pendingRef.current, ...staged];
    return staged.map((entry) => entry.blobUrl);
  }, []);

  const takePending = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = [];
    return pending;
  }, []);

  const restorePending = useCallback((pending: readonly PendingTaskImage[]) => {
    if (pending.length === 0) return;
    pendingRef.current = [...pending, ...pendingRef.current];
  }, []);

  const peekPending = useCallback(() => pendingRef.current, []);

  return { onUploadImages, takePending, restorePending, peekPending };
}
