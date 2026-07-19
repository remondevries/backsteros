"use client";

import { useEffect } from "react";

import { shouldBlockPageShortcuts, shouldHandleGlobalShortcut } from "./shortcut-guards.js";
import { useLatestRef } from "./use-latest-ref.js";

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

export function useLetterPdfMaximizeShortcut(
  onToggle: () => void,
  options: { enabled?: boolean } = {},
): void {
  const { enabled = true } = options;
  const onToggleRef = useLatestRef(onToggle);

  useEffect(() => {
    if (!enabled) return;

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
  }, [enabled, onToggleRef]);
}
