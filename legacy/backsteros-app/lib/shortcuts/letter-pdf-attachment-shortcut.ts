import { useEffect } from "react";

import { useLatestRef } from "@/hooks/use-latest-ref";
import { shouldBlockPageShortcuts } from "@/lib/shortcuts/is-blocking-modal-open";
import { shouldHandleGlobalShortcut } from "@/lib/shortcuts/should-handle-global-shortcut";

export const LETTER_PDF_ATTACHMENT_SHORTCUT_MAX = 5;

export function parseLetterPdfAttachmentShortcutIndex(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
): number | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return null;
  }

  if (event.key.length !== 1 || event.key < "1" || event.key > "5") {
    return null;
  }

  return Number.parseInt(event.key, 10) - 1;
}

export function resolveLetterPdfAttachmentShortcutTarget(
  index: number,
  attachmentIds: readonly string[],
  hasLegacyPdf: boolean,
): string | null {
  if (index < 0 || index >= LETTER_PDF_ATTACHMENT_SHORTCUT_MAX) {
    return null;
  }

  if (attachmentIds.length > 0) {
    return attachmentIds[index] ?? null;
  }

  if (index === 0 && hasLegacyPdf) {
    return "";
  }

  return null;
}

export function useLetterPdfAttachmentShortcuts({
  attachmentIds,
  hasLegacyPdf,
  onSelect,
}: {
  attachmentIds: readonly string[];
  hasLegacyPdf: boolean;
  onSelect: (attachmentId: string) => void;
}): void {
  const attachmentIdsRef = useLatestRef(attachmentIds);
  const hasLegacyPdfRef = useLatestRef(hasLegacyPdf);
  const onSelectRef = useLatestRef(onSelect);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const index = parseLetterPdfAttachmentShortcutIndex(event);
      if (index == null) {
        return;
      }

      const attachmentId = resolveLetterPdfAttachmentShortcutTarget(
        index,
        attachmentIdsRef.current,
        hasLegacyPdfRef.current,
      );
      if (attachmentId == null) {
        return;
      }

      if (shouldBlockPageShortcuts()) {
        return;
      }

      if (!shouldHandleGlobalShortcut(event)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      onSelectRef.current(attachmentId);
    }

    // Capture so 1–5 select PDF tabs on letter pages instead of section tabs.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [attachmentIdsRef, hasLegacyPdfRef, onSelectRef]);
}
