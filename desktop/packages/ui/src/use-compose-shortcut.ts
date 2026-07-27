"use client";

import { useEffect } from "react";

/**
 * Global C shortcut to open compose (matches Next useComposeShortcut).
 */
export function useComposeShortcut({
  enabled = true,
  commandPaletteOpen = false,
  onCompose,
}: {
  enabled?: boolean;
  commandPaletteOpen?: boolean;
  onCompose: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      const isC =
        (event.key.length === 1 && event.key.toLowerCase() === "c") ||
        event.code === "KeyC";
      if (!isC) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable ||
          target.closest(".cm-editor") ||
          target.closest("[role='textbox']")
        ) {
          return;
        }
      }

      event.preventDefault();
      event.stopPropagation();
      onCompose();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled, onCompose]);
}
