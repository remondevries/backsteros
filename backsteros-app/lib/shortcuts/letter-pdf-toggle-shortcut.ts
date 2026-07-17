import { useEffect } from "react";

import { useLatestRef } from "@/hooks/use-latest-ref";
import { shouldBlockPageShortcuts } from "@/lib/shortcuts/is-blocking-modal-open";
import { shouldHandleGlobalShortcut } from "@/lib/shortcuts/should-handle-global-shortcut";

export const LETTER_PDF_TOGGLE_SHORTCUT_HINT = "⇧P";

export function isLetterPdfToggleShortcut(event: KeyboardEvent): boolean {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.shiftKey &&
    (event.key.toLowerCase() === "p" || event.code === "KeyP")
  );
}

export function useLetterPdfToggleShortcut(onToggle: () => void): void {
  const onToggleRef = useLatestRef(onToggle);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isLetterPdfToggleShortcut(event)) {
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

    // Capture + stopImmediatePropagation so ⇧P toggles the PDF viewer on
    // letter pages instead of opening the project property dropdown.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onToggleRef]);
}
