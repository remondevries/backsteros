"use client";

import { useEffect } from "react";

import { shouldBlockBrowserTabFocus } from "@/lib/shortcuts/should-block-browser-tab-focus";

/**
 * Prevents free browser Tab focus traversal across the shell.
 * Matches Circle: stay on defined hotkeys / focus areas instead of cycling links.
 */
export function useBlockBrowserTabFocus({
  enabled = true,
}: { enabled?: boolean } = {}) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!shouldBlockBrowserTabFocus(event)) {
        return;
      }

      event.preventDefault();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled]);
}
