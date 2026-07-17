"use client";

import { useEffect } from "react";

import { useContentSidePanel } from "@/components/shell/content-side-panel-provider";
import { isContentSidePanelToggleShortcut } from "@/lib/shortcuts/content-side-panel-toggle-shortcut";
import { shouldHandleGlobalShortcut } from "@/lib/shortcuts/should-handle-global-shortcut";

export function useContentSidePanelToggleShortcut({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const { toggle } = useContentSidePanel();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!isContentSidePanelToggleShortcut(event)) {
        return;
      }

      if (!shouldHandleGlobalShortcut(event)) {
        return;
      }

      event.preventDefault();
      toggle();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, toggle]);
}
