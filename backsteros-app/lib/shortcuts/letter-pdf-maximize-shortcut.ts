import { useEffect } from "react";

import { useLatestRef } from "@/hooks/use-latest-ref";
import { shouldBlockPageShortcuts } from "@/lib/shortcuts/is-blocking-modal-open";
import { shouldHandleGlobalShortcut } from "@/lib/shortcuts/should-handle-global-shortcut";

export const LETTER_PDF_MAXIMIZE_SHORTCUT_HINT = "⇧F";

export function isLetterPdfMaximizeShortcut(event: KeyboardEvent): boolean {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.shiftKey &&
    (event.key.toLowerCase() === "f" || event.code === "KeyF")
  );
}

export function useLetterPdfMaximizeShortcut(onToggle: () => void): void {
  const onToggleRef = useLatestRef(onToggle);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isLetterPdfMaximizeShortcut(event)) {
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
      onToggleRef.current();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onToggleRef]);
}
