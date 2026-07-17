"use client";

import { useEffect } from "react";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import { scrollContentPreviewByArrowKey } from "@/lib/shortcuts/content-preview-scroll";

export function useContentPreviewScrollShortcuts({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const { open: commandPaletteOpen } = useCommandPalette();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) {
        return;
      }

      if (!scrollContentPreviewByArrowKey(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled]);
}
