"use client";

import { useEffect } from "react";

import { shouldHandleToggleHighlightedSelectionShortcut } from "./list-toggle-highlighted-selection-shortcut.js";

/**
 * Shift+Space toggles selection for the keyboard-highlighted row.
 */
export function useListToggleHighlightedSelectionShortcut({
  enabled = true,
  highlightedId,
  onToggle,
}: {
  enabled?: boolean;
  highlightedId: string | null;
  onToggle: (id: string) => void;
}) {
  useEffect(() => {
    if (!enabled || !highlightedId) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (
        !shouldHandleToggleHighlightedSelectionShortcut(event, true)
      ) {
        return;
      }
      if (!highlightedId) return;

      event.preventDefault();
      event.stopPropagation();
      onToggle(highlightedId);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, highlightedId, onToggle]);
}
