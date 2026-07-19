"use client";

import { useEffect } from "react";

import { shouldBlockPageShortcuts, shouldHandleGlobalShortcut } from "./shortcut-guards.js";
import { useLatestRef } from "./use-latest-ref.js";

export const LETTER_PDF_TOGGLE_SHORTCUT_HINT = "P";

export function isLetterPdfToggleShortcut(event: KeyboardEvent): boolean {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key.toLowerCase() === "p" || event.code === "KeyP")
  );
}

export function useLetterPdfToggleShortcut(
  onToggle: () => void,
  options: { enabled?: boolean } = {},
): void {
  const { enabled = true } = options;
  const onToggleRef = useLatestRef(onToggle);

  useEffect(() => {
    if (!enabled) return;

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

    // Capture + stopImmediatePropagation so plain P toggles PDF on letter
    // pages instead of opening the project property dropdown.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onToggleRef]);
}
