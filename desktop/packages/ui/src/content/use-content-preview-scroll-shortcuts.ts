"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
import { scrollContentPreviewByArrowKey } from "./content-preview-scroll.js";

export function useContentPreviewScrollShortcuts({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const { openRef } = useCommandPaletteRuntimeRefs();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (openRef.current) {
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
  }, [enabled, openRef]);
}
